import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';

// ==========================================
// WebFetchService — извлечение текста со страниц
// ==========================================
// Пользователь может скинуть ИИ ссылку и попросить «изучи этот сайт».
// Мы не даём ИИ прямого выхода в интернет, вместо этого фронт зовёт
// этот эндпоинт, тот извлекает основной текст страницы и возвращает
// его — фронт подмешивает извлечённый контент в сам запрос к LLM
// как «вот содержимое той ссылки: ...».
//
// Как парсим:
// - fetch с User-Agent как у обычного браузера, чтобы сайты не отдавали
//   отдельную мобильную/бот-версию;
// - таймаут 15с (в чат-контроллере ждать долго не хочется);
// - лимит 500КБ на страницу — большие HTML-страницы всё равно бесполезны
//   для LLM (модель захлебнётся токенами);
// - в HTML вырезаем <script>, <style>, <noscript> и HTML-теги,
//   схлопываем пробелы. Это не полноценный readability-парсер, но
//   для простых задач «что написано на странице» — достаточно;
// - если Content-Type не text/html — возвращаем ошибку (PDF, изображения,
//   бинарники не имеет смысла извлекать).
//
// Безопасность:
// - блокируем private-адреса (127.0.0.1, 10.0.0.0/8, 192.168.0.0/16,
//   169.254.0.0/16, localhost) — защита от SSRF-атак на внутреннюю сеть;
// - только http/https схемы (не file://, ftp:// и т.п.);
// - лимит длины итогового текста, чтобы не раздувать промпт.

@Injectable()
export class WebFetchService {
  private readonly timeoutMs = 15_000;
  private readonly maxBytes = 500_000;
  private readonly maxTextLen = 12_000;

  async fetchUrl(url: string): Promise<{ url: string; title: string; text: string; truncated: boolean }> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Некорректный URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('Поддерживаются только http:// и https:// URL');
    }
    // Простая защита от SSRF на внутреннюю сеть по имени хоста.
    // Полноценная защита требует DNS-resolve и проверки IP; для нашего
    // сценария (пользователь сам вводит ссылку) достаточно префильтра.
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      throw new BadRequestException('Приватные адреса недоступны для загрузки');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          // Реалистичный User-Agent — многие сайты режут не-браузерные запросы
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru,en;q=0.8',
        },
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        throw new ServiceUnavailableException(`Сайт не ответил за ${Math.round(this.timeoutMs / 1000)}с`);
      }
      throw new ServiceUnavailableException(`Не удалось загрузить страницу: ${e?.message || e}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw new ServiceUnavailableException(`Сайт вернул HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(contentType) && !/text\/plain/i.test(contentType)) {
      throw new BadRequestException(`Формат страницы (${contentType.split(';')[0]}) не поддерживается — работаю только с HTML/текстом`);
    }

    // Читаем ограниченное количество байтов через ReadableStream, чтобы
    // не тянуть 50-мегабайтный HTML в память ради LLM.
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ServiceUnavailableException('Пустой ответ от сайта');
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
          if (total >= this.maxBytes) break;
        }
      }
    } catch (e: any) {
      throw new ServiceUnavailableException(`Ошибка чтения страницы: ${e?.message || e}`);
    }

    const raw = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    const { title, text } = this.extractText(raw);
    const truncated = text.length > this.maxTextLen;
    const finalText = truncated ? text.slice(0, this.maxTextLen) + '\n[…текст обрезан…]' : text;

    console.log(`[WebFetchService] ${parsed.hostname} → ${finalText.length} симв, title="${title.slice(0, 60)}"`);
    return {
      url: parsed.toString(),
      title,
      text: finalText,
      truncated,
    };
  }

  // Простой text-extractor: убираем скрипты/стили/теги и схлопываем
  // пробелы. Это не readability и не Mozilla Readability — но
  // для типового кейса «прочитай что на странице» модель дальше
  // разберётся сама.
  private extractText(html: string): { title: string; text: string } {
    // Заголовок
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? this.decodeEntities(titleMatch[1].trim()) : '';

    // Убираем всё, что модели точно не нужно
    let stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '); // все теги
    // Декодируем HTML-сущности
    stripped = this.decodeEntities(stripped);
    // Схлопываем пробелы
    stripped = stripped.replace(/[ \t\r\n\v\f]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    return { title, text: stripped };
  }

  private decodeEntities(s: string): string {
    return s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '…')
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
  }
}
