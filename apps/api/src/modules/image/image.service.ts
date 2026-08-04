import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// Генерация изображений через OpenAI (gpt-image-1 / dall-e-3)
// ==========================================
// Ключ (OPENAI_API_KEY) живёт ТОЛЬКО в окружении сервера — в браузер
// не попадает. Фронтенд шлёт текстовый промпт, получает URL/base64 картинки.
//
// История багов на этом сервисе показала, что доступ к моделям генерации
// изображений у разных аккаунтов OpenAI РАЗНЫЙ и непредсказуемый: сначала
// у DALL-E 3 отвалился параметр response_format, затем сам аккаунт стал
// получать "The model 'dall-e-3' does not exist" — это означает, что у
// данного ключа доступна только новая модель gpt-image-1 (или наоборот,
// у части ключей — только dall-e-3, если организация не прошла верификацию
// для gpt-image-1). Вместо того чтобы гадать и хардкодить одну модель,
// сервис пробует МОДЕЛИ ПО ОЧЕРЕДИ: primary → fallback, автоматически
// переключаясь при ошибке "модель не существует / нет доступа". Внутри
// каждой попытки также работает авто-удаление неизвестных параметров
// (см. isUnknownParam ниже) — это защищает от обеих категорий изменений
// API одновременно.
@Injectable()
export class ImageService {
  private readonly apiUrl = 'https://api.openai.com/v1/images/generations';
  private readonly timeoutMs = 60_000;

  // Порядок важен: gpt-image-1 — новая единая модель OpenAI для генерации
  // изображений (пришла на смену DALL-E 3 для большинства новых аккаунтов),
  // пробуем её первой. Если у ключа нет доступа (org не верифицирована) —
  // падаем на dall-e-3 как проверенный временем вариант. Если и он
  // недоступен — dall-e-2 как последняя гарантированная опция: она
  // доступна всем аккаунтам OpenAI без каких-либо ограничений/верификаций.
  //
  // Разные модели принимают РАЗНЫЕ параметры:
  // - gpt-image-1: quality — 'low'|'medium'|'high'|'auto' (НЕ 'standard'),
  //   не принимает response_format, не принимает style. ТРЕБУЕТ
  //   верификации организации у большинства аккаунтов.
  // - dall-e-3: quality — 'standard'|'hd', размер 1024x1024/1792x1024/
  //   1024x1792, доступ есть у большинства старых аккаунтов.
  // - dall-e-2: quality не принимает вовсе (одна ступень качества),
  //   размер 256x256/512x512/1024x1024. Доступна всем.
  private readonly modelConfigs: Array<{ model: string; body: Record<string, any> }> = [
    { model: 'gpt-image-1', body: { quality: 'high', size: '1024x1024' } },
    { model: 'dall-e-3', body: { quality: 'standard', size: '1024x1024' } },
    { model: 'dall-e-2', body: { size: '1024x1024' } },
  ];

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      console.error('[ImageService] OPENAI_API_KEY пустой или не задан');
      throw new ServiceUnavailableException('Генератор изображений не сконфигурирован (ключ OpenAI не задан)');
    }
    const key = apiKey.trim();
    if (!key.startsWith('sk-') || key.length < 20) {
      console.error(`[ImageService] OPENAI_API_KEY похож на плейсхолдер (длина=${key.length})`);
      throw new ServiceUnavailableException('Ключ OpenAI имеет неверный формат (должен начинаться с sk-)');
    }

    const safePrompt = prompt.length > 1500 ? prompt.slice(0, 1500) : prompt;
    console.log(`[ImageService] запрос → "${safePrompt.slice(0, 100)}${safePrompt.length > 100 ? '…' : ''}"`);

    let lastError: unknown = null;
    for (let modelIdx = 0; modelIdx < this.modelConfigs.length; modelIdx++) {
      const cfg = this.modelConfigs[modelIdx];
      const body: Record<string, any> = {
        model: cfg.model,
        prompt: safePrompt,
        n: 1,
        ...cfg.body,
      };
      try {
        const url = await this.callOpenAi(key, body, 0);
        if (modelIdx > 0) {
          console.log(`[ImageService] сработала fallback-модель '${cfg.model}' (основная была недоступна)`);
        }
        return url;
      } catch (e: any) {
        lastError = e;
        const isModelUnavailable = e?.__modelUnavailable === true;
        const isLastConfig = modelIdx === this.modelConfigs.length - 1;
        if (isModelUnavailable && !isLastConfig) {
          console.warn(`[ImageService] модель '${cfg.model}' недоступна для этого ключа, пробую следующую…`);
          continue;
        }
        // Либо это не «модель недоступна» (значит другая проблема — billing/
        // policy/ключ — нет смысла пробовать другую модель), либо это была
        // последняя модель в списке — пробрасываем ошибку пользователю.
        throw e;
      }
    }
    throw lastError instanceof Error ? lastError : new ServiceUnavailableException('Не удалось сгенерировать изображение');
  }

  // attempt: 0 — первая попытка для текущей модели, 1 — повтор после
  // удаления «неизвестного» параметра. Больше одного повтора на параметр
  // не делаем — если и вторая попытка падает на другом параметре, это уже
  // не косметическая проблема API, пользователю нужно показать причину.
  private async callOpenAi(key: string, body: Record<string, any>, attempt: number): Promise<string> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const modelTag = `[ImageService/${body.model}]`;

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
        console.error(`${modelTag} таймаут ${this.timeoutMs}мс`);
        throw new ServiceUnavailableException(`OpenAI не ответил за ${Math.round(this.timeoutMs / 1000)}с. Попробуй ещё раз.`);
      }
      console.error(`${modelTag} сетевая ошибка: ${e?.message || e}`);
      throw new ServiceUnavailableException('Сбой сети при обращении к OpenAI. Попробуй ещё раз.');
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const took = Date.now() - started;
      console.error(`${modelTag} попытка ${attempt + 1} HTTP ${response.status} за ${took}мс: ${errorBody.slice(0, 2000)}`);

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

      // Модель недоступна для этого ключа/организации — сигнализируем
      // наверх специальным флагом, чтобы generate() попробовал следующую
      // модель из списка вместо того чтобы сразу падать с ошибкой.
      //
      // Также сюда попадают: (а) ошибки верификации организации у
      // gpt-image-1 (аккаунт без пройденной проверки не может её
      // использовать); (б) невнятные 400 с упоминанием 'safety' или
      // 'content_policy' — на новых моделях (gpt-image-1) это часто НЕ
      // реальный content policy violation, а способ платформы сказать
      // «доступ ограничен для вашего типа аккаунта». Мы даём попробовать
      // следующую модель — если ВСЕ модели подряд ответят одинаково,
      // тогда покажем финальную ошибку про policy.
      const looksLikeSafetyOrVerify =
        /verification|verify.*organization|not.*verified|content.?policy|safety.*system/i.test(
          parsedMessage || errorBody
        );
      const isModelUnavailable =
        response.status === 400 &&
        (parsedCode === 'model_not_found' ||
          /does not exist/i.test(parsedMessage || '') ||
          /does not have access/i.test(parsedMessage || '') ||
          looksLikeSafetyOrVerify);
      if (isModelUnavailable) {
        const err: any = new ServiceUnavailableException(`Модель ${body.model} недоступна для этого ключа OpenAI`);
        err.__modelUnavailable = true;
        throw err;
      }

      // Авто-восстановление: «Unknown parameter: 'X'» на первой попытке —
      // убираем X из тела и пробуем ещё раз без него.
      const isUnknownParam = response.status === 400 && (parsedCode === 'unknown_parameter' || /unknown parameter/i.test(parsedMessage || ''));
      if (isUnknownParam && parsedParam && attempt === 0 && parsedParam in body) {
        console.warn(`${modelTag} авто-ретрай: убираю параметр '${parsedParam}' и пробую снова`);
        const retryBody = { ...body };
        delete retryBody[parsedParam];
        return this.callOpenAi(key, retryBody, attempt + 1);
      }

      const lowerBody = errorBody.toLowerCase();
      if (response.status === 400) {
        // Реальная политика контента — только по явному коду, а не по
        // упоминанию слова в тексте (эти уже перехвачены как fallback выше).
        if (parsedCode === 'content_policy_violation') {
          throw new ServiceUnavailableException('Запрос отклонён политикой безопасности OpenAI. Переформулируй промпт.');
        }
        if (lowerBody.includes('billing') || lowerBody.includes('quota')) {
          throw new ServiceUnavailableException('Проблема с оплатой OpenAI: закончилась квота или требуется пополнение баланса аккаунта.');
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
      if (response.status === 403) {
        // 403 у gpt-image-1 часто означает «организация не верифицирована»
        // — это тоже повод попробовать fallback-модель, а не сразу сдаваться.
        const err: any = new ServiceUnavailableException('Доступ к модели запрещён (организация не верифицирована?)');
        err.__modelUnavailable = true;
        throw err;
      }
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
      console.error(`${modelTag} пустой data в ответе:`, JSON.stringify(data).slice(0, 200));
      throw new ServiceUnavailableException('Пустой ответ генератора');
    }
    console.log(`${modelTag} ок за ${Date.now() - started}мс (попытка ${attempt + 1})`);
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.b64_json === 'string' && first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    console.error(`${modelTag} неизвестный формат:`, JSON.stringify(first).slice(0, 200));
    throw new ServiceUnavailableException('Неожиданный формат ответа генератора');
  }
}
