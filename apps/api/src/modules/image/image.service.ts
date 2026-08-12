import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений — OpenRouter (Grok Imagine) → OpenAI fallback
// ==========================================
// История: OpenAI Images API у этого аккаунта нестабилен — для доступа к
// gpt-image-1 нужно потратить $5 (verification tier). DALL-E 2/3 ПОЛНОСТЬЮ
// отключены OpenAI 12.05.2026 (retired) — раньше стояли первыми в fallback
// и просто гарантированно падали. x-ai/grok-2-image тоже снят с продажи
// (актуальная замена — grok-imagine-image-quality), и OpenRouter в июле
// 2026 перевёл генерацию картинок на отдельный dedicated-эндпоинт
// /api/v1/images (старый OpenAI-совместимый /images/generations для
// картинок больше не отвечает). Пользователь нашёл выход: использовать
// OpenRouter (у нас там уже есть работающий ключ для Qwen Coder) как
// основной путь, а OpenAI оставить резервом на случай, если Grok сам
// недоступен.
//
// Порядок (актуально на август 2026):
//   1) OPENROUTER_API_KEY + x-ai/grok-imagine-image-quality через
//      POST /api/v1/images — основной путь. Ответ: data[].b64_json +
//      data[].media_type.
//   2) OPENAI_API_KEY + gpt-image-1 → gpt-image-2 → gpt-image-1-mini —
//      fallback, идёт последовательно с автоматической сменой модели при
//      «недоступности» (model_not_found, verification required и т.п.).
//
// Умное восстановление: если один параметр запроса вызывает 400
// «Unknown parameter: X» — сервис вырезает X и пробует ещё раз (защита
// от изменения допустимых параметров API без деплоя).
//
// Референсные фото (Image-to-Image): когда пользователь прикрепляет
// фото в режиме «Генерация изображений», они приходят сюда как массив
// data-URL base64 (images?: string[]). OpenRouter/Grok Imagine принимает
// референс через поле image_url в теле запроса (data-URL напрямую).
// Для OpenAI-резерва используем отдельный эндпоинт /v1/images/edits
// (multipart/form-data с исходным файлом) вместо /v1/images/generations —
// именно так OpenAI поддерживает img2img у gpt-image-*.

@Injectable()
export class ImageService {
  private readonly timeoutMs = 60_000;

  async generate(prompt: string, images?: string[]): Promise<string> {
    const safePrompt = prompt.length > 1500 ? prompt.slice(0, 1500) : prompt;
    const refs = (images || []).filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, 4);
    // Задача 4: раньше при наличии референсных фото (пользователь просит
    // «добавь на моё фото...», «измени это фото...») промпт уходил
    // провайдеру БЕЗ явного указания, что это именно РЕДАКТИРОВАНИЕ
    // присланного изображения. Генеративные модели (особенно Grok Imagine
    // через image_url) без такой инструкции нередко трактуют референс
    // как смутное «вдохновение для стиля» и рисуют новое, лишь похожее
    // изображение — то есть теряют исходное фото пользователя вместо
    // того чтобы дополнить/видоизменить именно его. Явно проговариваем
    // задачу редактирования только когда референсы реально есть — если
    // пользователь просит просто «нарисуй...» без фото, промпт не трогаем.
    const finalPrompt = refs.length > 0
      ? `Отредактируй приложенное изображение (это референс, а НЕ вдохновение для нового рисунка): сохрани композицию, объект(ы), пропорции, ракурс и общий стиль исходного фото без изменений, и внеси ТОЛЬКО то, что просит пользователь ниже. Результат должен быть узнаваемо тем же фото/объектом, а не новым похожим изображением. Запрос пользователя: ${safePrompt}`
      : safePrompt;
    console.log(`[ImageService] запрос → "${safePrompt.slice(0, 100)}${safePrompt.length > 100 ? '…' : ''}"${refs.length ? ` (+${refs.length} референс(а/ов), режим редактирования)` : ''}`);

    const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    if (!openrouterKey && !openaiKey) {
      throw new ServiceUnavailableException('Ни один провайдер изображений не сконфигурирован (нужен OPENROUTER_API_KEY или OPENAI_API_KEY)');
    }

    const errors: string[] = [];

    // 1) OpenRouter / Grok Imagine — основной провайдер
    if (openrouterKey) {
      try {
        const url = await this.callOpenRouterGrok(openrouterKey, finalPrompt, refs);
        return url;
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.warn(`[ImageService] OpenRouter Grok не сработал: ${msg}`);
        errors.push(`OpenRouter: ${msg}`);
      }
    }

    // 2) OpenAI как fallback
    if (openaiKey) {
      if (!openaiKey.startsWith('sk-') || openaiKey.length < 20) {
        errors.push('OpenAI: ключ имеет неверный формат');
      } else {
        try {
          return await this.callOpenAiWithModelFallback(openaiKey, finalPrompt, refs);
        } catch (e: any) {
          errors.push(`OpenAI: ${e?.message || String(e)}`);
        }
      }
    }

    throw new ServiceUnavailableException(
      `Не удалось сгенерировать изображение. ${errors.join('. ')}`
    );
  }

  // ==========================================
  // OpenRouter — Grok Imagine Image Quality
  // ==========================================
  // ВАЖНО: OpenRouter в июле 2026 перевёл генерацию картинок на отдельный
  // dedicated-эндпоинт /api/v1/images (старый OpenAI-совместимый путь
  // /images/generations для картинок больше не работает — модели через
  // него стабильно возвращают 404 "No model found"). Плюс сама модель
  // x-ai/grok-2-image снята с продажи xAI — актуальная замена в той же
  // линейке Grok Imagine — x-ai/grok-imagine-image-quality.
  private async callOpenRouterGrok(apiKey: string, prompt: string, refs: string[] = []): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    const modelTag = '[ImageService/OpenRouter/x-ai/grok-imagine-image-quality]';

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'https://void-code.ru',
          'X-Title': 'Void Code AI',
        },
        body: JSON.stringify({
          // Grok Imagine Image Quality — актуальный генератор от xAI на
          // OpenRouter. Ключ тот же, что для Qwen — единая биллинг-точка,
          // не требует отдельной верификации организации.
          model: 'x-ai/grok-imagine-image-quality',
          prompt,
          n: 1,
          // Референсные фото (Image-to-Image): Grok Imagine принимает
          // изображение-референс как data-URL в image_url. При нескольких
          // референсах передаём первый как основной, остальные —
          // дополнительным массивом (провайдер сам решает, что использовать).
          ...(refs.length ? { image_url: refs[0], image_urls: refs } : {}),
        }),
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
        throw new Error(`OpenRouter не ответил за ${Math.round(this.timeoutMs / 1000)}с`);
      }
      throw new Error(`сетевая ошибка: ${e?.message || e}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`${modelTag} HTTP ${response.status}:`, errorBody.slice(0, 1000));
      let parsedMessage: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed?.error?.message || null;
      } catch { /* not json */ }
      if (response.status === 401) throw new Error('ключ OpenRouter недействителен');
      if (response.status === 402) throw new Error('нет баланса на OpenRouter');
      if (response.status === 429) throw new Error('rate limit OpenRouter');
      throw new Error(parsedMessage ? parsedMessage.slice(0, 200) : `HTTP ${response.status}`);
    }
    const data: any = await response.json();
    console.log(`${modelTag} ок за ${Date.now() - started}мс`);
    const first = data.data?.[0];
    if (!first) throw new Error('OpenRouter вернул пустой data');
    // Новый dedicated Image API всегда отдаёт b64_json + media_type (не
    // url, как раньше в OpenAI-совместимом формате) — но на всякий
    // случай проверяем оба поля.
    if (typeof first.b64_json === 'string' && first.b64_json) {
      const mediaType = typeof first.media_type === 'string' ? first.media_type : 'image/png';
      return `data:${mediaType};base64,${first.b64_json}`;
    }
    if (typeof first.url === 'string' && first.url) return first.url;
    throw new Error('неизвестный формат ответа OpenRouter');
  }

  // ==========================================
  // OpenAI fallback — по очереди
  // ==========================================
  private readonly openAiConfigs: Array<{ model: string; body: Record<string, any> }> = [
    // DALL-E 2/3 полностью отключены OpenAI 12.05.2026 — заменены на
    // актуальную линейку GPT Image (gpt-image-1 уже был в списке и
    // остаётся первым, как ранее подтверждённо рабочий вариант).
    { model: 'gpt-image-1', body: { quality: 'high', size: '1024x1024' } },
    { model: 'gpt-image-2', body: { quality: 'high', size: '1024x1024' } },
    { model: 'gpt-image-1-mini', body: { quality: 'auto', size: '1024x1024' } },
  ];

  private async callOpenAiWithModelFallback(key: string, prompt: string, refs: string[] = []): Promise<string> {
    let lastError: unknown = null;
    for (let i = 0; i < this.openAiConfigs.length; i++) {
      const cfg = this.openAiConfigs[i];
      const body: Record<string, any> = {
        model: cfg.model,
        prompt,
        n: 1,
        ...cfg.body,
      };
      try {
        const url = await this.callOpenAiOnce(key, body, 0, refs);
        if (i > 0) console.log(`[ImageService/OpenAI] сработал fallback '${cfg.model}'`);
        return url;
      } catch (e: any) {
        lastError = e;
        if (e?.__modelUnavailable === true && i < this.openAiConfigs.length - 1) {
          console.warn(`[ImageService/OpenAI] '${cfg.model}' недоступна, пробую следующую…`);
          continue;
        }
        throw e;
      }
    }
    throw lastError instanceof Error ? lastError : new ServiceUnavailableException('OpenAI: все модели недоступны');
  }

  // Разбирает data-URL (data:image/png;base64,...) на MIME-тип и Buffer —
  // нужно, чтобы приложить референсное фото как файл в multipart-запросе.
  private parseDataUrl(dataUrl: string): { mediaType: string; buffer: Buffer } {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error('некорректный формат референсного изображения');
    return { mediaType: match[1], buffer: Buffer.from(match[2], 'base64') };
  }

  private async callOpenAiOnce(key: string, body: Record<string, any>, attempt: number, refs: string[] = []): Promise<string> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const modelTag = `[ImageService/OpenAI/${body.model}]`;
    // С референсными фото используем /v1/images/edits (Image-to-Image,
    // multipart/form-data с приложенным файлом) вместо обычного
    // /v1/images/generations — так OpenAI поддерживает img2img у gpt-image-*.
    const useEdits = refs.length > 0;
    const endpoint = useEdits ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations';

    let response: Response;
    try {
      if (useEdits) {
        const form = new FormData();
        for (const [k, v] of Object.entries(body)) {
          if (v === undefined || v === null) continue;
          form.append(k, String(v));
        }
        refs.forEach((ref, idx) => {
          const { mediaType, buffer } = this.parseDataUrl(ref);
          const ext = mediaType.split('/')[1] || 'png';
          // Buffer.buffer типизирован как ArrayBufferLike (включает
          // SharedArrayBuffer), а BlobPart требует конкретно ArrayBuffer —
          // Uint8Array.from(...) создаёт копию с гарантированно свежим
          // ArrayBuffer, чего достаточно для маленьких референсных фото.
          form.append('image[]', new Blob([Uint8Array.from(buffer)], { type: mediaType }), `reference-${idx}.${ext}`);
        });
        response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}` },
          body: form as any,
        });
      } else {
        response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
        });
      }
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
        throw new ServiceUnavailableException(`OpenAI не ответил за ${Math.round(this.timeoutMs / 1000)}с`);
      }
      throw new ServiceUnavailableException('Сбой сети при обращении к OpenAI');
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`${modelTag} попытка ${attempt + 1} HTTP ${response.status} за ${Date.now() - started}мс: ${errorBody.slice(0, 1500)}`);

      let parsedMessage: string | null = null;
      let parsedCode: string | null = null;
      let parsedParam: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed?.error?.message || null;
        parsedCode = parsed?.error?.code || parsed?.error?.type || null;
        parsedParam = parsed?.error?.param || null;
      } catch { /* not json */ }

      const looksLikeSafetyOrVerify = /verification|verify.*organization|not.*verified|content.?policy|safety.*system/i.test(parsedMessage || errorBody);
      const isModelUnavailable =
        (response.status === 400 || response.status === 403) &&
        (parsedCode === 'model_not_found' ||
          /does not exist/i.test(parsedMessage || '') ||
          /does not have access/i.test(parsedMessage || '') ||
          looksLikeSafetyOrVerify);
      if (isModelUnavailable) {
        const err: any = new ServiceUnavailableException(`Модель ${body.model} недоступна`);
        err.__modelUnavailable = true;
        throw err;
      }

      const isUnknownParam = response.status === 400 && (parsedCode === 'unknown_parameter' || /unknown parameter/i.test(parsedMessage || ''));
      if (isUnknownParam && parsedParam && attempt === 0 && parsedParam in body) {
        console.warn(`${modelTag} авто-ретрай: убираю '${parsedParam}'`);
        const retryBody = { ...body };
        delete retryBody[parsedParam];
        return this.callOpenAiOnce(key, retryBody, attempt + 1, refs);
      }

      const lowerBody = errorBody.toLowerCase();
      if (response.status === 400) {
        if (parsedCode === 'content_policy_violation') {
          throw new ServiceUnavailableException('Запрос отклонён политикой безопасности OpenAI. Переформулируй промпт.');
        }
        if (lowerBody.includes('billing') || lowerBody.includes('quota')) {
          throw new ServiceUnavailableException('Проблема с оплатой OpenAI: закончилась квота.');
        }
        if (parsedMessage) throw new ServiceUnavailableException(`OpenAI: ${parsedMessage.slice(0, 200)}`);
        throw new ServiceUnavailableException('OpenAI отклонил запрос (400)');
      }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Rate limit OpenAI');
      if (response.status >= 500) throw new ServiceUnavailableException('OpenAI временно недоступен');
      throw new ServiceUnavailableException(`Ошибка HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const first = data.data?.[0];
    if (!first) throw new ServiceUnavailableException('OpenAI: пустой ответ');
    console.log(`${modelTag} ок за ${Date.now() - started}мс`);
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    throw new ServiceUnavailableException('OpenAI: неизвестный формат');
  }
}
