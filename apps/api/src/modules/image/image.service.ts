import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через OpenAI DALL-E 3
// ==========================================
// Ключ (OPENAI_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает URL картинки.
//
// В прошлых версиях запрос уходил в OpenAI без таймаута и с обрубленной
// диагностикой — при 400 пользователь видел «Ошибка генерации: HTTP 400»
// без конкретной причины. Теперь:
//  1) AbortController с 60-секундным таймаутом.
//  2) Полный errorBody (до 2000 символов) логируется в pm2.
//  3) JSON-ответ OpenAI парсится, error.message пробрасывается на фронт —
//     теперь пользователь сразу видит конкретную причину (billing_hard_limit,
//     model_not_found, invalid_request, content_policy_violation и т.п.).
//  4) Мягкая проверка формата ключа — только для явно битых значений
//     (пустая строка, "your-api-key-here"), чтобы не отсекать валидные
//     project-keys (sk-proj-...) или новые форматы ключей.
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
    // Отсекаем только явные плейсхолдеры — реальные ключи бывают разного
    // формата (sk-, sk-proj-, sk-svcacct- и т.д.), жёсткий regex мог
    // отсечь валидный ключ и это давало ложное «Ключ неверного формата».
    const key = apiKey.trim();
    if (!key.startsWith('sk-') || key.length < 20) {
      console.error(`[ImageService/DALL-E3] OPENAI_API_KEY похож на плейсхолдер (длина=${key.length})`);
      throw new ServiceUnavailableException('Ключ OpenAI имеет неверный формат (должен начинаться с sk-)');
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // DALL-E 3 имеет жёсткий лимит на длину промпта (~4000 символов), но
    // мы обрезаем раньше — на 1500, чтобы влезло с revised_prompt и не
    // тратить квоту на слишком длинные ассистент-подсказки.
    const safePrompt = prompt.length > 1500 ? prompt.slice(0, 1500) : prompt;
    console.log(`[ImageService/DALL-E3] запрос → "${safePrompt.slice(0, 100)}${safePrompt.length > 100 ? '…' : ''}"`);

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: safePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          // response_format НЕ передаём: с недавних пор OpenAI отдаёт
          // на DALL-E 3 «Unknown parameter: 'response_format'» — этот
          // параметр депрекейтнут для gpt-image-1/dall-e-3. URL всё
          // равно возвращается по умолчанию (data[0].url), а если у
          // нового API вернётся b64_json — обработчик ответа ниже
          // справится и с этим (см. `if first.b64_json`).
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
      const took = Date.now() - started;
      // Пишем в лог полный текст (до 2000 симв) — этого хватит на любую
      // ошибку OpenAI, включая {"error":{"message":"...","code":"..."}}.
      console.error(`[ImageService/DALL-E3] HTTP ${response.status} за ${took}мс: ${errorBody.slice(0, 2000)}`);

      // Пробуем распарсить JSON — OpenAI возвращает { error: { message, code, type } }.
      // Если получится, показываем именно error.message пользователю — это
      // максимально конкретное объяснение (billing, model_not_found и т.п.).
      let parsedMessage: string | null = null;
      let parsedCode: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed?.error?.message || null;
        parsedCode = parsed?.error?.code || parsed?.error?.type || null;
      } catch {
        // errorBody не JSON — оставляем null
      }

      // Специальная обработка типовых кодов ошибок OpenAI.
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
        // Общий случай 400 — берём parsedMessage если есть.
        if (parsedMessage) {
          throw new ServiceUnavailableException(`OpenAI: ${parsedMessage.slice(0, 200)}`);
        }
        throw new ServiceUnavailableException('OpenAI отклонил запрос (400). Проверь логи сервера.');
      }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 403) throw new ServiceUnavailableException('Доступ к DALL-E 3 запрещён (проверь права ключа)');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов к OpenAI. Попробуй через минуту.');
      if (response.status >= 500) throw new ServiceUnavailableException('OpenAI недоступен, попробуй через минуту');

      // Fallback: пробрасываем распаршенное сообщение или generic текст.
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
    console.log(`[ImageService/DALL-E3] ок за ${Date.now() - started}мс`);
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    console.error('[ImageService/DALL-E3] неизвестный формат:', JSON.stringify(first).slice(0, 200));
    throw new ServiceUnavailableException('Неожиданный формат ответа генератора');
  }
}
