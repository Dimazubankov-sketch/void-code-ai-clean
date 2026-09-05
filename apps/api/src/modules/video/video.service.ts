import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';

// ==========================================
// Генерация видео — OpenRouter (ByteDance Seedance 2.0 / 2.5)
// ==========================================
// В отличие от картинок (синхронный /api/v1/images), видео у OpenRouter
// генерируется АСИНХРОННО: POST /api/v1/videos сразу отдаёт job (202,
// status: pending) с polling_url, и нужно периодически опрашивать
// GET /api/v1/videos/{id} до status: completed/failed/cancelled/expired.
// Генерация занимает от ~30 секунд до нескольких минут (зависит от
// длительности и разрешения) — держать это одним HTTP-запросом от
// клиента нельзя: у Cloudflare перед этим сервером простой (idle) таймаут
// в 100 секунд (см. тот же нюанс, из-за которого в чате стоит heartbeat
// на стриминге). Поэтому здесь ДВА эндпоинта: submit (мгновенно
// возвращает jobId) и status (клиент опрашивает сам, каждый вызов
// быстрый). Ни один отдельный запрос не рискует упереться в таймаут.
//
// Grok Imagine Video убран из генерации видео полностью — заменён на
// Seedance: 2.0 («Стандартная», до 15с) и 2.5 («Продвинутая», до 30с,
// длинноформатные ролики + больше референсов). Максимум длительности
// проверяется здесь же (MODEL_MAX_DURATION) — защита на случай, если
// фронт по какой-то причине пришлёт для 2.0 значение больше 15с.
export const VIDEO_MODELS = ['bytedance/seedance-2.0', 'bytedance/seedance-2.5'] as const;
export type VideoModel = typeof VIDEO_MODELS[number];

export const MODEL_MAX_DURATION: Record<VideoModel, number> = {
  'bytedance/seedance-2.0': 15,
  'bytedance/seedance-2.5': 30,
};

interface SubmitParams {
  prompt: string;
  model: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  // Первый кадр (image-to-video) — data-URL или обычный https URL.
  imageUrl?: string;
}

@Injectable()
export class VideoService {
  private readonly timeoutMs = 30_000; // короткий — это только submit/poll, не всё видео

  private apiKey(): string {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException('Провайдер видео не сконфигурирован (нужен OPENROUTER_API_KEY)');
    return key;
  }

  async submit(params: SubmitParams): Promise<{ jobId: string; pollingUrl: string }> {
    if (!VIDEO_MODELS.includes(params.model as VideoModel)) {
      throw new BadRequestException(`Неизвестная модель видео: ${params.model}`);
    }
    const maxDuration = MODEL_MAX_DURATION[params.model as VideoModel];
    if (params.duration && params.duration > maxDuration) {
      throw new BadRequestException(`Максимальная длительность для этой модели — ${maxDuration} секунд`);
    }
    const key = this.apiKey();
    const body: Record<string, any> = {
      model: params.model,
      prompt: params.prompt.length > 1500 ? params.prompt.slice(0, 1500) : params.prompt,
    };
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    if (params.duration) body.duration = params.duration;
    if (params.resolution) body.resolution = params.resolution;
    // image-to-video: первый кадр передаём как frame_images. Схема
    // OpenRouter — дискриминированный union по полю `type`, и image_url
    // сам по себе объект { url }, а не голая строка (баг: раньше сюда
    // уходила строка и отсутствовал type, из-за чего OpenRouter отвечал
    // "invalid_value: expected \"image_url\"" на path frame_images[0].type).
    if (params.imageUrl) {
      body.frame_images = [
        { type: 'image_url', image_url: { url: params.imageUrl }, frame_type: 'first_frame' },
      ];
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/videos', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': process.env.APP_URL || 'https://void-code.ru',
          'X-Title': 'Void Code AI',
        },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') throw new ServiceUnavailableException('OpenRouter (видео) не ответил вовремя на отправку задачи');
      throw new ServiceUnavailableException(`Сетевая ошибка при отправке задачи на генерацию видео: ${e?.message || e}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[VideoService/submit] HTTP', response.status, errorBody.slice(0, 800));
      let msg: string | null = null;
      try { msg = JSON.parse(errorBody)?.error?.message || null; } catch { /* not json */ }
      if (response.status === 401) throw new ServiceUnavailableException('Ключ OpenRouter недействителен');
      if (response.status === 402) throw new ServiceUnavailableException('Нет баланса на OpenRouter');
      if (response.status === 429) throw new ServiceUnavailableException('Rate limit OpenRouter (видео)');
      throw new ServiceUnavailableException(msg ? msg.slice(0, 200) : `HTTP ${response.status}`);
    }
    const data: any = await response.json();
    if (!data?.id) throw new ServiceUnavailableException('OpenRouter не вернул id задачи генерации видео');
    console.log(`[VideoService/submit] задача ${data.id} (${params.model}) отправлена`);
    return { jobId: data.id, pollingUrl: data.polling_url };
  }

  async pollOnce(jobId: string): Promise<{ status: string; url: string | null; error: string | null; cost: number | null }> {
    const key = this.apiKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') throw new ServiceUnavailableException('OpenRouter (видео) не ответил вовремя на опрос статуса');
      throw new ServiceUnavailableException(`Сетевая ошибка при опросе статуса видео: ${e?.message || e}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      if (response.status === 404) throw new ServiceUnavailableException('Задача генерации видео не найдена (возможно, истекла)');
      const errorBody = await response.text().catch(() => '');
      console.error('[VideoService/poll] HTTP', response.status, errorBody.slice(0, 500));
      throw new ServiceUnavailableException(`Ошибка опроса статуса видео (HTTP ${response.status})`);
    }
    const data: any = await response.json();
    const status = String(data?.status || 'pending');
    const url = Array.isArray(data?.unsigned_urls) && data.unsigned_urls.length > 0 ? data.unsigned_urls[0] : null;
    if (status === 'completed') console.log(`[VideoService/poll] ${jobId} готово, cost=${data?.usage?.cost ?? '?'}`);
    return {
      status,
      url,
      error: data?.error || null,
      cost: typeof data?.usage?.cost === 'number' ? data.usage.cost : null,
    };
  }
}
