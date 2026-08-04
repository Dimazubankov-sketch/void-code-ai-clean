import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений — двухпровайдерная схема
// ==========================================
// Три раунда правок с OpenAI (dall-e-3 depreкейт, unknown_parameter,
// gpt-image-1 org verification, model_not_found, safety-подобные ошибки)
// показали, что связка OpenAI+Images для этого конкретного аккаунта
// нестабильна: то одно, то другое всё время отваливается. Решение —
// НЕ полагаться на один провайдер, а иметь запасной.
//
// Порядок:
// 1) TOGETHER AI (черный.flux.1-schnell-Free) — быстро, бесплатно, без
//    org-verification, промпт-free, требует TOGETHER_API_KEY. Работает
//    для любых аккаунтов, регистрация занимает 1 минуту.
// 2) OpenAI gpt-image-1 → dall-e-3 → dall-e-2 — как раньше, но теперь
//    это ФОЛБЭК на случай, если Together API-ключ не задан или упал.
//
// Если Together-ключ есть — используется он (быстро, стабильно, бесплатно).
// Если нет — сервис прозрачно уходит на OpenAI, как раньше.

interface ProviderResult {
  url: string;
}

@Injectable()
export class ImageService {
  private readonly timeoutMs = 60_000;

  async generate(prompt: string): Promise<string> {
    const safePrompt = prompt.length > 1500 ? prompt.slice(0, 1500) : prompt;
    console.log(`[ImageService] запрос → "${safePrompt.slice(0, 100)}${safePrompt.length > 100 ? '…' : ''}"`);

    const togetherKey = process.env.TOGETHER_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    if (!togetherKey && !openaiKey) {
      throw new ServiceUnavailableException('Ни один провайдер изображений не сконфигурирован (нужен TOGETHER_API_KEY или OPENAI_API_KEY)');
    }

    const errors: string[] = [];

    // 1) Together AI (FLUX.1-schnell)
    if (togetherKey) {
      try {
        const url = await this.callTogether(togetherKey, safePrompt);
        return url;
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.warn(`[ImageService] Together AI не сработал: ${msg}`);
        errors.push(`Together: ${msg}`);
        // Продолжаем на OpenAI, если ключ есть
      }
    }

    // 2) OpenAI как fallback
    if (openaiKey) {
      if (!openaiKey.startsWith('sk-') || openaiKey.length < 20) {
        throw new ServiceUnavailableException('Ключ OpenAI имеет неверный формат');
      }
      try {
        return await this.callOpenAiWithModelFallback(openaiKey, safePrompt);
      } catch (e: any) {
        errors.push(`OpenAI: ${e?.message || String(e)}`);
      }
    }

    throw new ServiceUnavailableException(
      `Не удалось сгенерировать изображение. ${errors.join('. ')}`
    );
  }

  // ==========================================
  // Together AI (FLUX.1-schnell-Free)
  // ==========================================
  private async callTogether(apiKey: string, prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();

    let response: Response;
    try {
      response = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          // FLUX.1-schnell-Free — бесплатная быстрая модель (4 шага, ~2сек).
          model: 'black-forest-labs/FLUX.1-schnell-Free',
          prompt,
          width: 1024,
          height: 1024,
          steps: 4,
          n: 1,
        }),
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        throw new Error(`Together AI таймаут ${Math.round(this.timeoutMs / 1000)}с`);
      }
      throw new Error(`Together AI сетевая ошибка: ${e?.message || e}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[ImageService/Together] HTTP ${response.status}:`, errorBody.slice(0, 1000));
      if (response.status === 401) throw new Error('Ключ Together AI недействителен');
      if (response.status === 429) throw new Error('Rate limit Together AI');
      throw new Error(`Together AI HTTP ${response.status}`);
    }
    const data: any = await response.json();
    console.log(`[ImageService/Together] ок за ${Date.now() - started}мс`);
    const first = data.data?.[0];
    if (first?.url) return first.url;
    if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
    throw new Error('Together AI: пустой ответ');
  }

  // ==========================================
  // OpenAI с моделями по очереди (как было раньше)
  // ==========================================
  private readonly openAiConfigs: Array<{ model: string; body: Record<string, any> }> = [
    { model: 'gpt-image-1', body: { quality: 'high', size: '1024x1024' } },
    { model: 'dall-e-3', body: { quality: 'standard', size: '1024x1024' } },
    { model: 'dall-e-2', body: { size: '1024x1024' } },
  ];

  private async callOpenAiWithModelFallback(key: string, prompt: string): Promise<string> {
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
        const url = await this.callOpenAiOnce(key, body, 0);
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

  private async callOpenAiOnce(key: string, body: Record<string, any>, attempt: number): Promise<string> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const modelTag = `[ImageService/${body.model}]`;

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
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
      if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
        throw new ServiceUnavailableException(`OpenAI не ответил за ${Math.round(this.timeoutMs / 1000)}с`);
      }
      throw new ServiceUnavailableException('Сбой сети OpenAI');
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`${modelTag} попытка ${attempt + 1} HTTP ${response.status} за ${Date.now() - started}мс: ${errorBody.slice(0, 1000)}`);

      let parsedMessage: string | null = null;
      let parsedCode: string | null = null;
      let parsedParam: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed?.error?.message || null;
        parsedCode = parsed?.error?.code || parsed?.error?.type || null;
        parsedParam = parsed?.error?.param || null;
      } catch { /* not json */ }

      // «Недоступна» — любой сигнал, что модель не отдаст результат
      // именно этому ключу: не существует, нет доступа, не верифицирован
      // аккаунт, safety-подобная ошибка (у gpt-image-1 без верификации
      // OpenAI отвечает именно так).
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
        return this.callOpenAiOnce(key, retryBody, attempt + 1);
      }

      const lowerBody = errorBody.toLowerCase();
      if (response.status === 400) {
        if (parsedCode === 'content_policy_violation') {
          throw new ServiceUnavailableException('Запрос отклонён политикой безопасности. Переформулируй промпт.');
        }
        if (lowerBody.includes('billing') || lowerBody.includes('quota')) {
          throw new ServiceUnavailableException('Проблема с оплатой OpenAI: закончилась квота.');
        }
        if (parsedMessage) throw new ServiceUnavailableException(`OpenAI: ${parsedMessage.slice(0, 200)}`);
        throw new ServiceUnavailableException('OpenAI отклонил запрос (400)');
      }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenAI недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Rate limit OpenAI');
      if (response.status >= 500) throw new ServiceUnavailableException('OpenAI недоступен');
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
