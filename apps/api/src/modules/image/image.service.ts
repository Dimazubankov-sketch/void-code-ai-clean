import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через OpenAI DALL-E 3
// ==========================================
// Ключ (OPENAI_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает URL картинки.
//
// История багов на этом сервисе показала, что OpenAI периодически меняет
// набор допустимых параметров у /v1/images/generations без предупреждения
// (сначала отвалился response_format). Чтобы не гоняться за каждым новым
// «Unknown parameter: X» вручную, сервис теперь УМЕЕТ САМ ВОССТАНАВЛИВАТЬСЯ:
// если OpenAI вернёт 400 с ошибкой invalid_request_error/unknown_parameter
// и точно указанным именем параметра (`error.param`), сервис автоматически
// вырезает именно этот параметр из тела запроса и повторяет попытку РОВНО
// ОДИН РАЗ. Это защищает от будущих подобных изменений API без деплоя.
@Injectable()
export class ImageService {
  private readonly model = 'dall-e-3';
  private readonly apiUrl = 'https://api.openai.com/v1/images/generations';
  private readonly timeoutMs = 60_000;

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      console.error('[ImageService/DALL-E3] OPENAI_API_KEY пустой или не задан');
      throw new ServiceUnavailableException('Генератор изображений не сконфигурирован (ключ OpenAI не задан)');
    }
    const key = apiKey.trim();
    if (!key.startsWith('sk-') || key.length < 20) {
      console.error(`[ImageService/DALL-E3] OPENAI_API_KEY похож на плейсхолдер (длина=${key.length})`);
      throw new ServiceUnavailableException('Ключ OpenAI имеет неверный формат (должен начинаться с sk-)');
    }

    const safePrompt = prompt.length > 1500 ? prompt.slice(0, 1500) : prompt;
    console.log(`[ImageService/DALL-E3] запрос → "${safePrompt.slice(0, 100)}${safePrompt.length > 100 ? '…' : ''}"`);

    // Базовое тело запроса. quality/size/model — самые стабильные параметры
    // DALL-E 3, но на всякий случай тоже могут попасть под авто-ретрай, если
    // OpenAI однажды переименует их.
    const body: Record<string, any> = {
      model: this.model,
      prompt: safePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    };

    const result = await this.callOpenAi(key, body, 0);
    return result;
  }

  // attempt: 0 — первая попытка, 1 — повтор после удаления «неизвестного» параметра.
  // Больше одного повтора не делаем — если и вторая попытка падает на другом
  // параметре, это уже не косметическая проблема API, а что-то более
  // серьёзное (ключ/доступ/баланс), пользователю нужно показать причину,
  // а не уходить в бесконечный цикл повторов.
  private async callOpenAi(key: string, body: Record<string, any>, attempt: number): Promise<string> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      clearTimeout(timer);
      const isAbort = e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
      if (isAbort) {
        console.error(`[ImageService/DALL-E3] таймаут ${this.timeoutMs}мс`);
        throw new ServiceUnavailableException(`OpenAI не ответил за ${Math.round(this.timeoutMs / 1000)}с. Попробуй ещё раз.`);
      }
      console.error(`[ImageService/DALL-E3] сетевая ошибка: ${e?.message || e}`);
      throw new ServiceUnavailableException('Сбой сети при обращении к OpenAI. Попробуй ещё раз.');
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const took = Date.now() - started;
      console.error(`[ImageService/DALL-E3] попытка ${attempt + 1} HTTP ${response.status} за ${took}мс: ${errorBody.slice(0, 2000)}`);

      let parsedMessage: string | null = null;
      let parsedCode: string | null = null;
      let parsedParam: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed?.error?.message || null;
        parsedCode = parsed?.error?.code || parsed?.error?.type || null;
        parsedParam = parsed?.error?.param || null;
      } catch {
        // errorBody не JSON — оставляем null
      }

      // Авто-восстановление: «Unknown parameter: 'X'» на первой попытке —
      // убираем X из тела и пробуем ещё раз без него.
      const isUnknownParam = response.status === 400 && (parsedCode === 'unknown_parameter' || /unknown parameter/i.test(parsedMessage || ''));
      if (isUnknownParam && parsedParam && attempt === 0 && parsedParam in body) {
        console.warn(`[ImageService/DALL-E3] авто-ретрай: убираю параметр '${parsedParam}' и пробую снова`);
        const retryBody = { ...body };
        delete retryBody[parsedParam];
        return this.callOpenAi(key, retryBody, attempt + 1);
      }

      const lowerBody = errorBody.toLowerCase();
      if (response.status === 400) {
        if (lowerBody.includes('content_policy') || lowerBody.includes('safety')) {
          throw new ServiceUnavailableException('Запрос отклонён политикой безопасности OpenAI. Переформулируй промпт.');
        }
        if (lowerBody.includes('billing') || lowerBody.includes('quota')) {
          throw new ServiceUnavailableException('Проблема с оплатой OpenAI: закончилась квота или требуется пополнение баланса аккаунта.');
        }
        if (lowerBody.includes('model_not_found') || lowerBody.includes('does not have access')) {
          throw new ServiceUnavailableException('У аккаунта OpenAI нет доступа к DALL-E 3 (проверь план и лимиты).');
        }
        if (lowerBody.includes('invalid api key') || lowerBody.includes('incorrect api key')) {
          throw new ServiceUnavailableException('Ключ OpenAI недействителен. Проверь OPENAI_API_KEY в .env.');
        }
        if (parsedMessage) {
          throw new ServiceUnavailableException(`OpenAI: ${parsedMessage.slice(0, 200)}`);
        }
        throw new ServiceUnavailableException('OpenAI отклонил запрос (400). Проверь логи сервера.');
      }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 403) throw new ServiceUnavailableException('Доступ к DALL-E 3 запрещён (проверь права ключа)');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов к OpenAI. Попробуй через минуту.');
      if (response.status >= 500) throw new ServiceUnavailableException('OpenAI недоступен, попробуй через минуту');

      if (parsedMessage) {
        throw new ServiceUnavailableException(`OpenAI: ${parsedMessage.slice(0, 200)}`);
      }
      throw new ServiceUnavailableException(`Ошибка генерации: HTTP ${response.status}${parsedCode ? ` (${parsedCode})` : ''}`);
    }

    const data: any = await response.json();
    const first = data.data?.[0];
    if (!first) {
      console.error('[ImageService/DALL-E3] пустой data в ответе:', JSON.stringify(data).slice(0, 200));
      throw new ServiceUnavailableException('Пустой ответ генератора');
    }
    console.log(`[ImageService/DALL-E3] ок за ${Date.now() - started}мс (попытка ${attempt + 1})`);
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    console.error('[ImageService/DALL-E3] неизвестный формат:', JSON.stringify(first).slice(0, 200));
    throw new ServiceUnavailableException('Неожиданный формат ответа генератора');
  }
}
