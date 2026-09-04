import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';

// ==========================================
// Генерация видео — OpenRouter (Grok Imagine Video / 1.5)
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
export const VIDEO_MODELS = ['x-ai/grok-imagine-video', 'x-ai/grok-imagine-video-1.5'] as const;
export type VideoModel = typeof VIDEO_MODELS[number];

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
    const key = this.apiKey();
    const body: Record<string, any> = {
      model: params.model,
      prompt: params.prompt.length > 1500 ? params.prompt.slice(0, 1500) : params.prompt,
    };
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    if (params.duration) body.duration = params.duration;
    if (params.resolution) body.resolution = params.resolution;
    // image-to-video: первый кадр передаём как frame_images (формат,
    // задокументированный OpenRouter для этого режима).
    if (params.imageUrl) {
      body.frame_images = [{ frame_type: 'first_frame', image_url: params.imageUrl }];
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
