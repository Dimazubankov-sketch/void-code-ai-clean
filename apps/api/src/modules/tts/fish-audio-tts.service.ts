import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';

// ==========================================
// Синтез речи через Fish Audio (модель s2.1-pro)
// ==========================================
// Второй TTS-провайдер наравне с OpenAI (см. tts.service.ts). Намеренно
// отдельный класс, а не ветвление внутри TtsService — у провайдеров разный
// формат запроса (модель передаётся HTTP-заголовком, голос — полем
// reference_id, а не фиксированным enum voice), разная валидация и разные
// коды ошибок, смешивать их в одном сервисе только повышает риск сломать
// существующий OpenAI-путь.
//
// Ключ (FISH_AUDIO_API_KEY) — только в окружении сервера, во frontend
// никогда не попадает.
// Документация: https://docs.fish.audio/features/text-to-speech
// Тарификация: $15 за 1M символов — тот же порядок, что и OpenAI TTS-1.
const TTS_URL = 'https://api.fish.audio/v1/tts';
const VOICES_URL = 'https://api.fish.audio/model';
// Модель передаётся заголовком `model`, а не полем в теле запроса.
// s2.1-pro — «production»-модель Fish (лучшее качество/задержка).
const MODEL_HEADER = 's2.1-pro';

export interface FishVoice {
  id: string;
  title: string;
}

@Injectable()
export class FishAudioTtsService {
  // Было 30с изначально в OpenAI-сервисе — тот же аргумент здесь: сеть до
  // api.fish.audio может быть недоступна с сервера целиком, и без таймаута
  // клиент увидит «бесконечную загрузку» вместо понятной ошибки.
  private readonly timeoutMs = 15_000;

  // Простой in-memory кэш списка публичных голосов — без Redis и очередей,
  // как и просили. Список голосов Fish меняется редко, поэтому 6 часов
  // кэша заметно снижает нагрузку на Fish API при каждом открытии
  // настроек озвучки (иначе это был бы round-trip на каждый рендер модалки).
  private voicesCache: { at: number; items: FishVoice[] } | null = null;
  private readonly voicesCacheTtlMs = 6 * 60 * 60 * 1000;

  private apiKey(): string {
    const key = process.env.FISH_AUDIO_API_KEY;
    if (!key) throw new ServiceUnavailableException('Fish Audio TTS не сконфигурирован');
    return key;
  }

  private validate(text: string, speed: number) {
    if (!text || text.length === 0) throw new BadRequestException('Пустой текст');
    if (text.length > 4096) throw new BadRequestException('Текст слишком длинный (макс 4096 символов на один запрос)');
    // Fish поддерживает 0.5–2.0 по документации (у OpenAI 0.25–4.0) —
    // зажимаем в допустимый Fish-диапазон, чтобы не словить 400 от них.
    return { speed: Math.max(0.5, Math.min(2.0, speed)) };
  }

  private buildRequestBody(text: string, voice: string | undefined, speed: number): string {
    const body: Record<string, unknown> = {
      text,
      format: 'mp3',
      // balanced ≈ 300мс до первого байта — заложено на будущее для
      // стриминга (см. streamTo ниже), сейчас не влияет на буферизованный путь.
      latency: 'balanced',
      prosody: { speed },
    };
    // reference_id не передаём вовсе, если голос не выбран — Fish в этом
    // случае использует голос модели по умолчанию, это валидный запрос.
    if (voice) body.reference_id = voice;
    return JSON.stringify(body);
  }

  private async requestFish(text: string, voice: string | undefined, speed: number): Promise<Response> {
    const v = this.validate(text, speed);
    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Полезно видеть в логах, ушёл ли reference_id вообще — если голос
    // регулярно звучит «роботизированно» независимо от выбора в UI, это
    // первое, что нужно проверить: либо на бэкенд не долетает voice
    // (баг на фронте/DTO), либо сам список голосов пуст (см. listVoices).
    console.log(`[FishAudioTtsService] синтез, reference_id=${voice || '(нет — голос модели по умолчанию)'}`);
    let response: Response;
    try {
      response = await fetch(TTS_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          model: MODEL_HEADER,
        },
        body: this.buildRequestBody(text, voice, v.speed),
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        throw new ServiceUnavailableException('Fish Audio не ответил вовремя');
      }
      throw new ServiceUnavailableException('Сбой сети при обращении к Fish Audio');
    }
    clearTimeout(timer);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[FishAudioTtsService] HTTP ${response.status}:`, errorBody.slice(0, 500));
      if (response.status === 401) throw new ServiceUnavailableException('Ключ Fish Audio недействителен');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов к Fish Audio. Попробуй через минуту.');
      throw new ServiceUnavailableException(`Ошибка Fish Audio TTS: HTTP ${response.status}`);
    }
    return response;
  }

  // Буферизованный синтез — основной путь. Тот же паттерн, что и у
  // OpenAI-провайдера: контроллер сейчас всегда использует именно его
  // (см. комментарий про Cloudflare в tts.controller.ts), не streamTo().
  async synthesize(text: string, voice: string | undefined, speed: number = 1.0): Promise<Buffer> {
    const response = await this.requestFish(text, voice, speed);
    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // Стриминговый вариант — подготовлен на будущее (задача явно просит
  // заложить возможность стриминга, не создавая сложную очередь). Fish
  // отдаёт тело POST /v1/tts как обычный бинарный поток (не SSE), поэтому
  // прокидываем его в Express Response ровно так же, как streamTo() у
  // OpenAI-сервиса. Контроллер сейчас его не вызывает, но включить можно
  // одной строкой, когда Cloudflare-путь для аудио станет надёжным.
  async streamTo(res: ExpressResponse, text: string, voice: string | undefined, speed: number = 1.0) {
    const response = await this.requestFish(text, voice, speed);
    if (!response.body) {
      const arrayBuf = await response.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
      return;
    }
    const reader = response.body.getReader();
    try {
      if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) res.write(Buffer.from(value));
      }
      res.end();
    } catch (e: any) {
      console.error('[FishAudioTtsService/stream] чтение сломалось:', e?.message || e);
      try { reader.cancel(); } catch { /* ignore */ }
      if (!res.headersSent) { res.status(502); res.end(); } else { res.end(); }
    }
  }

  // Список публичных голосов Fish Audio для UI выбора голоса. Кэшируем на
  // процесс (см. voicesCache выше). При сбое сети/лимите отдаём последний
  // успешный кэш, если он есть — интерфейс не должен падать из-за
  // временной недоступности Fish API.
  async listVoices(): Promise<FishVoice[]> {
    if (this.voicesCache && Date.now() - this.voicesCache.at < this.voicesCacheTtlMs) {
      return this.voicesCache.items;
    }
    let apiKey: string;
    try {
      apiKey = this.apiKey();
    } catch {
      return this.voicesCache?.items ?? [];
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // sort_by=task_count — самые используемые публичные голоса первыми,
      // разумный дефолт для витрины без ручной курации списка.
      const url = `${VOICES_URL}?page_size=8&sort_by=task_count`;
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      clearTimeout(timer);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        // Подробный лог тела ответа — единственный способ понять причину
        // сбоя без доступа к живому Fish API из среды разработки (ключ и
        // сеть есть только на проде). Смотреть через `pm2 logs void-code-api`.
        console.error(`[FishAudioTtsService/listVoices] HTTP ${response.status}:`, errorBody.slice(0, 500));
        return this.voicesCache?.items ?? [];
      }
      const data: any = await response.json().catch(() => null);
      const items: FishVoice[] = Array.isArray(data?.items)
        ? data.items
            .map((it: any) => ({ id: it?._id || it?.id, title: it?.title || 'Voice' }))
            .filter((v: FishVoice) => !!v.id)
        : [];
      if (!items.length) {
        // Ответ 200, но пустой/неожиданной формы список — логируем сырой
        // JSON (обрезанный), чтобы увидеть реальные имена полей Fish API,
        // если они отличаются от ожидаемых (_id/id, items).
        console.warn('[FishAudioTtsService/listVoices] пустой список голосов, сырой ответ:', JSON.stringify(data)?.slice(0, 500));
      }
      if (items.length) this.voicesCache = { at: Date.now(), items };
      // Полезно видеть в логах, что список реально пришёл и сколько голосов
      // в нём — без этого «тихий успех» неотличим от «тихого падения».
      if (items.length) console.log(`[FishAudioTtsService/listVoices] получено голосов: ${items.length}`);
      return items.length ? items : (this.voicesCache?.items ?? []);
    } catch (e: any) {
      clearTimeout(timer);
      console.error('[FishAudioTtsService/listVoices] сбой:', e?.message || e);
      return this.voicesCache?.items ?? [];
    }
  }
}
