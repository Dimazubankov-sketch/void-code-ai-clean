import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через OpenAI DALL-E 3
// ==========================================
// Ключ (OPENAI_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает URL картинки.
//
// В прошлых версиях запрос уходил в OpenAI без таймаута и без логирования
// содержимого ошибок — из-за этого при малейшем сбое пользователь видел
// только «Не удалось сгенерировать изображение…». Теперь:
//  1) AbortController с 60-секундным таймаутом — DALL-E 3 обычно
//     отвечает за 6–20 сек, но при загрузке OpenAI бывало и по минуте;
//     если ответа нет за 60 — пользователю сразу сообщается о таймауте,
//     а не висит запрос до реального обрыва PM2/Nginx.
//  2) Логирование запроса/ответа с фильтрацией секретов — легче найти
//     конкретную причину в pm2 logs.
//  3) Специфические ошибки (нет ключа / контент-политика / rate-limit /
//     таймаут / сеть) возвращаются отдельными сообщениями.
@Injectable()
export class ImageService {
  private readonly model = 'dall-e-3';
  private readonly apiUrl = 'https://api.openai.com/v1/images/generations';
  private readonly timeoutMs = 60_000;

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[ImageService/DALL-E3] OPENAI_API_KEY не задан в окружении');
      throw new ServiceUnavailableException('Генератор изображений не сконфигурирован (нет ключа OpenAI)');
    }
    // Быстрая проверка формата ключа — типичная причина «unauthorized»:
    // пользователь скопировал название переменной вместе с ключом или ключ пустой.
    if (!/^sk-[A-Za-z0-9\-_]{20,}/.test(apiKey.trim())) {
      console.error('[ImageService/DALL-E3] OPENAI_API_KEY похож на некорректный (не начинается с sk-)');
      throw new ServiceUnavailableException('Ключ OpenAI имеет неверный формат');
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    console.log(`[ImageService/DALL-E3] запрос → prompt "${prompt.slice(0, 80)}"${prompt.length > 80 ? '…' : ''}`);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          n: 1,
          size: '1024x1024',
          // "standard" дешевле "hd" примерно вдвое ($0.040 vs $0.080)
          // при почти неотличимом качестве для типовых кейсов чата.
          quality: 'standard',
          response_format: 'url',
        }),
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
      console.error(`[ImageService/DALL-E3] HTTP ${response.status} за ${Date.now() - started}мс:`, errorBody.slice(0, 500));
      // Пробрасываем внятную ошибку по типовым ситуациям.
      if (response.status === 400 && errorBody.includes('content_policy')) {
        throw new ServiceUnavailableException('Запрос отклонён политикой безопасности OpenAI. Переформулируй промпт.');
      }
      if (response.status === 400 && errorBody.includes('billing')) {
        throw new ServiceUnavailableException('Проблема с оплатой OpenAI (billing). Проверь баланс аккаунта.');
      }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов. Попробуй через минуту.');
      if (response.status >= 500) throw new ServiceUnavailableException('OpenAI недоступен, попробуй через минуту');
      throw new ServiceUnavailableException(`Ошибка генерации: HTTP ${response.status}`);
    }

    const data: any = await response.json();
    // DALL-E 3 возвращает { data: [{ url, revised_prompt }] }.
    // URL действителен около часа — фронтенд сразу подтягивает картинку.
    const first = data.data?.[0];
    if (!first) {
      console.error('[ImageService/DALL-E3] пустой data в ответе:', JSON.stringify(data).slice(0, 200));
      throw new ServiceUnavailableException('Пустой ответ генератора');
    }
    console.log(`[ImageService/DALL-E3] ок за ${Date.now() - started}мс`);
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    console.error('[ImageService/DALL-E3] неизвестный формат:', JSON.stringify(first).slice(0, 200));
    throw new ServiceUnavailableException('Неожиданный формат ответа генератора');
  }
}
