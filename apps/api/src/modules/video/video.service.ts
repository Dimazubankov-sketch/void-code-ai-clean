import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { FishAudioTtsService } from '../tts/fish-audio-tts.service';
import { MediaCacheService } from './media-cache.service';
import { AudioMuxService } from './audio-mux.service';

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

// ==========================================
// Свой голос (Fish Audio) в видео — путь A / fallback B
// ==========================================
// Путь A: голос Fish уходит в Seedance как audio-референс
// (input_references), модель синхронизирует губы/тайминг сама.
// ВАЖНО (проверено по документации OpenRouter на дату реализации):
// audio- и video-референсы сейчас пробрасываются «только для провайдеров,
// которые их поддерживают — на данный момент это BytePlus Seedance 2.0».
// То есть 2.5 через OpenRouter аудио-референс пока НЕ принимает, даже
// если у ByteDance/BytePlus напрямую это уже есть. Поэтому при выбранном
// голосе модель принудительно понижается до 2.0, независимо от того, что
// выбрал пользователь (Стандартная/Продвинутая) — см. resolveModel().
//
// Fallback B: если Seedance всё равно отклонит job с audio-референсом
// (провайдер мог с тех пор поменять поведение, или конкретная комбинация
// параметров не поддерживается) — повторяем submit БЕЗ audio-референса
// (обычная генерация), а когда видео готово, ГОЛОС НАКЛАДЫВАЕТСЯ ПОВЕРХ
// уже готового ролика через ffmpeg (см. AudioMuxService). Ловим это по
// jobId → audio во pendingDubs; синхронизация губ в этом случае не
// гарантирована — pollOnce возвращает dubbed: true, чтобы UI мог честно
// об этом предупредить.
export type VoiceMode = 'none' | 'existing' | 'design';

interface SubmitParams {
  prompt: string;
  model: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  // Первый кадр (image-to-video) — data-URL или обычный https URL.
  imageUrl?: string;
  // Голос: 'existing' — voiceId из курируемого списка Fish (см.
  // FishAudioTtsService.listVoices), 'design' — новый голос по текстовому
  // описанию (voiceDescription). В обоих случаях script — реплика,
  // которую голос должен произнести (Fish это озвучивает буквально,
  // поэтому это ОТДЕЛЬНОЕ поле от общего prompt, а не парсинг диалога
  // из описания сцены).
  voiceMode?: VoiceMode;
  voiceId?: string;
  voiceDescription?: string;
  script?: string;
}

interface PendingDub {
  audioId: string;
  audioMime: string;
}

@Injectable()
export class VideoService {
  private readonly timeoutMs = 30_000; // короткий — это только submit/poll, не всё видео
  // fetch финального видеофайла для дозвучки (fallback B) — сам ролик в
  // разы тяжелее и дольше скачивается, чем submit/poll-запрос.
  private readonly downloadTimeoutMs = 60_000;

  // jobId → данные голоса, ожидающего наложения при следующем pollOnce
  // после completed (см. комментарий про fallback B выше). In-memory —
  // как и everywhere в этом файле; переживает только один процесс, но
  // ролик и так живёт минуты, а не дни.
  private readonly pendingDubs = new Map<string, PendingDub>();

  constructor(
    private readonly fishTts: FishAudioTtsService,
    private readonly mediaCache: MediaCacheService,
    private readonly audioMux: AudioMuxService,
  ) {}

  private apiKey(): string {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException('Провайдер видео не сконфигурирован (нужен OPENROUTER_API_KEY)');
    return key;
  }

  private publicUrlFor(mediaId: string): string {
    const base = (process.env.APP_URL || 'https://void-code.ru').replace(/\/$/, '');
    return `${base}/api/v1/media/${mediaId}`;
  }

  // Голос требует принудительного понижения модели до Seedance 2.0 (см.
  // комментарий у VoiceMode выше). Без голоса — модель как выбрал
  // пользователь (уже провалидирована в контроллере через whitelist).
  private resolveModel(params: SubmitParams): VideoModel {
    const requested = params.model as VideoModel;
    if (params.voiceMode && params.voiceMode !== 'none' && requested !== 'bytedance/seedance-2.0') {
      console.log(`[VideoService] голос запрошен — модель понижена ${requested} → bytedance/seedance-2.0 (audio-референс через OpenRouter сейчас поддерживает только 2.0)`);
      return 'bytedance/seedance-2.0';
    }
    return requested;
  }

  // Готовит аудио голоса (Fish) и кладёт его в публичный кэш. Возвращает
  // null, если голос не запрошен — вызывающий код тогда просто не
  // добавляет input_references.
  private async resolveVoiceAudio(params: SubmitParams): Promise<{ id: string; url: string; mime: string } | null> {
    if (!params.voiceMode || params.voiceMode === 'none') return null;
    const script = (params.script || '').trim();
    if (!script) throw new BadRequestException('Для озвучки нужен текст реплики (script)');

    let audio: Buffer;
    let mime: string;
    if (params.voiceMode === 'existing') {
      let id = params.voiceId;
      if (!id) {
        // Пункт 9 ТЗ: если пользователь включил «Голос Void», но не выбрал
        // конкретный голос — берём случайный из списка вместо отказа.
        // Явный выбор при этом всегда в приоритете (id уже задан выше).
        const list = await this.fishTts.listVoices();
        if (!list.length) throw new BadRequestException('Список голосов Void сейчас недоступен');
        id = list[Math.floor(Math.random() * list.length)].id;
      }
      audio = await this.fishTts.synthesize(script, id, 1.0);
      mime = 'audio/mpeg';
    } else {
      if (!params.voiceDescription?.trim()) throw new BadRequestException('Опишите новый голос словами');
      const designed = await this.fishTts.designVoice(params.voiceDescription, script, 'ru');
      audio = designed.audio;
      mime = designed.mime;
    }

    const id = this.mediaCache.put(audio, mime);
    return { id, url: this.publicUrlFor(id), mime };
  }

  private buildBody(params: SubmitParams, model: VideoModel, audioRef: { url: string } | null): Record<string, any> {
    const body: Record<string, any> = {
      model,
      prompt: params.prompt.length > 1500 ? params.prompt.slice(0, 1500) : params.prompt,
    };
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
    if (params.duration) body.duration = params.duration;
    if (params.resolution) body.resolution = params.resolution;
    // image-to-video: первый кадр передаём как frame_images. Схема
    // OpenRouter — дискриминированный union по полю `type`, и image_url
    // сам по себе объект { url }, а не голая строка.
    if (params.imageUrl) {
      body.frame_images = [
        { type: 'image_url', image_url: { url: params.imageUrl }, frame_type: 'first_frame' },
      ];
    }
    if (audioRef) {
      body.input_references = [
        { type: 'audio_url', audio_url: { url: audioRef.url } },
      ];
    }
    return body;
  }

  private async postToOpenRouter(key: string, body: Record<string, any>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch('https://openrouter.ai/api/v1/videos', {
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
      if (e?.name === 'AbortError') throw new ServiceUnavailableException('OpenRouter (видео) не ответил вовремя на отправку задачи');
      throw new ServiceUnavailableException(`Сетевая ошибка при отправке задачи на генерацию видео: ${e?.message || e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async submit(params: SubmitParams): Promise<{ jobId: string; pollingUrl: string; dubbed: boolean }> {
    if (!VIDEO_MODELS.includes(params.model as VideoModel)) {
      throw new BadRequestException(`Неизвестная модель видео: ${params.model}`);
    }
    const model = this.resolveModel(params);
    const maxDuration = MODEL_MAX_DURATION[model];
    if (params.duration && params.duration > maxDuration) {
      throw new BadRequestException(`Максимальная длительность для этой модели — ${maxDuration} секунд`);
    }
    const key = this.apiKey();
    const voiceAudio = await this.resolveVoiceAudio(params);

    let body = this.buildBody(params, model, voiceAudio);
    let response = await this.postToOpenRouter(key, body);
    let usedFallback = false;

    // Fallback B: если провайдер отклонил именно из-за audio-референса
    // (эвристика по тексту ошибки — OpenRouter не даёт отдельного кода
    // «аудио не поддерживается»), убираем input_references и пробуем ещё
    // раз обычной генерацией; голос наложим поверх готового видео позже.
    if (!response.ok && voiceAudio) {
      const errorText = await response.clone().text().catch(() => '');
      if (/audio|input_reference/i.test(errorText)) {
        console.warn('[VideoService/submit] провайдер отклонил audio-референс, повторяю без него (дозвучка после генерации):', errorText.slice(0, 300));
        body = this.buildBody(params, model, null);
        response = await this.postToOpenRouter(key, body);
        usedFallback = true;
      }
    }

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
    console.log(`[VideoService/submit] задача ${data.id} (${model}${voiceAudio ? ', с голосом' : ''}${usedFallback ? ', fallback-дозвучка' : ''}) отправлена`);

    if (voiceAudio && usedFallback) {
      this.pendingDubs.set(data.id, { audioId: voiceAudio.id, audioMime: voiceAudio.mime });
    }
    return { jobId: data.id, pollingUrl: data.polling_url, dubbed: false };
  }

  async pollOnce(jobId: string): Promise<{ status: string; url: string | null; error: string | null; cost: number | null; dubbed: boolean }> {
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
    let url = Array.isArray(data?.unsigned_urls) && data.unsigned_urls.length > 0 ? data.unsigned_urls[0] : null;
    let dubbed = false;

    const pendingDub = this.pendingDubs.get(jobId);
    if (status === 'completed' && url && pendingDub) {
      // Дозвучка (fallback B): скачиваем готовое видео, накладываем голос
      // из кэша, отдаём собственный публичный URL вместо оригинального.
      // Если что-то пойдёт не так — отдаём ИСХОДНОЕ видео без озвучки, а
      // не ломаем всю генерацию: пользователь всё равно получает ролик.
      try {
        const dubbedUrl = await this.dubVideo(url, pendingDub);
        url = dubbedUrl;
        dubbed = true;
      } catch (e: any) {
        console.error(`[VideoService/poll] дозвучка ${jobId} не удалась, отдаю видео без голоса:`, e?.message || e);
      } finally {
        this.pendingDubs.delete(jobId);
      }
    }

    if (status === 'completed') console.log(`[VideoService/poll] ${jobId} готово, cost=${data?.usage?.cost ?? '?'}${dubbed ? ', дозвучено' : ''}`);
    return {
      status,
      url,
      error: data?.error || null,
      cost: typeof data?.usage?.cost === 'number' ? data.usage.cost : null,
      dubbed,
    };
  }

  private async dubVideo(videoUrl: string, pending: PendingDub): Promise<string> {
    const audio = this.mediaCache.get(pending.audioId);
    if (!audio) throw new Error('Аудио голоса истекло в кэше до готовности видео');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.downloadTimeoutMs);
    let videoBuf: Buffer;
    try {
      const res = await fetch(videoUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`Не удалось скачать готовое видео (HTTP ${res.status})`);
      videoBuf = Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }

    const muxed = await this.audioMux.replaceAudio(videoBuf, audio.buf, audio.mime);
    const id = this.mediaCache.put(muxed, 'video/mp4');
    return this.publicUrlFor(id);
  }
}
