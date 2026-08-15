import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
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
  description: string;
}

// ------------------------------------------------------------------------
// Курируемый список голосов (задача: заменить «сырые» тайтлы из публичной
// библиотеки Fish на понятные англоязычные имена + краткое описание тембра,
// как у пресетов OpenAI). Реальный id голоса (reference_id) на этапе
// компиляции неизвестен — Fish не даёт «прикрепить» голос по фиксированному
// id навсегда, поэтому здесь только ПОИСКОВЫЙ запрос (title) к публичной
// библиотеке; сам _id резолвится и кэшируется в рантайме (см. listVoices).
// query — основной поисковый запрос (максимально похож на то, что видно
// в каталоге Fish); остальные строки в queries — запасные варианты (по
// одному слову/токену из названия), перебираются по порядку, пока
// какой-нибудь не найдёт совпадение в публичной библиотеке Fish.
interface CuratedVoiceDef {
  queries: string[];
  name: string;
  description: string;
}

const CURATED_VOICES: CuratedVoiceDef[] = [
  { queries: ['Мужской Профессиональный213', 'Мужской Профессиональный'],                                          name: 'Marcus',    description: 'Мужской, глубокий, деловой' },
  { queries: ['РасДК-836443 James Baker', 'James Baker', 'РасДК-836443', 'James', 'Baker'],                        name: 'James',     description: 'Мужской, уверенный, чёткий' },
  { queries: ['Сергей Бурунов x1Katari', 'Сергей Бурунов', 'Бурунов'],                                              name: 'Sergei',    description: 'Мужской, характерный, живой' },
  { queries: ['Adam Ксения Терехова', 'Ксения Терехова', 'Терехова', 'Ксения'],                                     name: 'Ksenia',    description: 'Женский, мягкий, тёплый' },
  { queries: ['Инциденты 2.0 ytwatchingalexandr', 'Инциденты 2.0', 'Инциденты'],                                    name: 'Alexander', description: 'Мужской, спокойный, размеренный' },
  { queries: ['история от котят Николай Абрамович', 'Николай Абрамович', 'Абрамович', 'история от котят'],          name: 'Nikolai',   description: 'Мужской, тёплый, повествовательный' },
  { queries: ['Меллстрой Скуф', 'Меллстрой'],                                                                       name: 'Mellstroy', description: 'Мужской, громкий, энергичный' },
  { queries: ['Рената Литвинова Серафима', 'Рената Литвинова', 'Серафима'],                                         name: 'Serafima',  description: 'Женский, глубокий, выразительный' },
  { queries: ['Обычный Голос s2yuzzll', 'Обычный Голос'],                                                           name: 'Olivia',    description: 'Женский, ровный, нейтральный' },
];

@Injectable()
export class FishAudioTtsService {
  // Было 30с изначально в OpenAI-сервисе — тот же аргумент здесь: сеть до
  // api.fish.audio может быть недоступна с сервера целиком, и без таймаута
  // клиент увидит «бесконечную загрузку» вместо понятной ошибки.
  private readonly timeoutMs = 15_000;

  // Отдельный, более короткий таймаут для поисковых запросов голосов
  // (searchVoice) — при обновлении кэша списка голосов один голос может
  // перебирать до 5 запросов подряд (см. CURATED_VOICES.queries), и это
  // метаданные, а не синтез, где точность важнее скорости. Короткий
  // таймаут не даёт единичному зависшему запросу раздувать общее время
  // резолва всего списка голосов.
  private readonly voiceSearchTimeoutMs = 6_000;

  // Простой in-memory кэш списка голосов — без Redis и очередей, как и
  // просили. Курируемый список голосов меняется только при правке кода,
  // поэтому 6 часов кэша заметно снижает нагрузку на Fish API (иначе
  // это было бы 9 поисковых round-trip'ов при каждом открытии настроек).
  private voicesCache: { at: number; items: FishVoice[] } | null = null;
  private readonly voicesCacheTtlMs = 6 * 60 * 60 * 1000;

  // Кэш готового аудио — задача явно требует максимально быстрой отдачи
  // озвучки в чате. Одно и то же сообщение в чате часто переслушивают
  // (повторное нажатие на «озвучить»), а во вкладке «Голос» одну и ту же
  // фразу-пример гоняют по несколько раз подряд при переключении голосов
  // туда-обратно. Кэшируем готовый MP3-буфер по хэшу (текст+голос+
  // скорость) на 15 минут — повторный вызов отдаётся мгновенно, без
  // единого запроса к Fish. Простая Map с ручной эвикцией по лимиту
  // записей — тот же принцип, что и voicesCache, никакого Redis.
  private readonly audioCache = new Map<string, { at: number; buf: Buffer }>();
  private readonly audioCacheTtlMs = 15 * 60 * 1000;
  private readonly audioCacheMaxEntries = 200;

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

  private audioCacheKey(text: string, voice: string | undefined, speed: number): string {
    return createHash('sha1').update(`${voice || ''}::${speed}::${text}`).digest('hex');
  }

  private readAudioCache(key: string): Buffer | null {
    const hit = this.audioCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > this.audioCacheTtlMs) {
      this.audioCache.delete(key);
      return null;
    }
    return hit.buf;
  }

  private writeAudioCache(key: string, buf: Buffer) {
    // Грубая эвикция: если лимит превышен, выкидываем самую старую запись
    // (первый ключ Map — порядок вставки в JS гарантирован). Этого более
    // чем достаточно для случайного повторного прослушивания, полноценный
    // LRU здесь избыточен.
    if (this.audioCache.size >= this.audioCacheMaxEntries) {
      const oldestKey = this.audioCache.keys().next().value;
      if (oldestKey) this.audioCache.delete(oldestKey);
    }
    this.audioCache.set(key, { at: Date.now(), buf });
  }

  // fast=true — «быстрый» набор параметров (см. комментарии внутри):
  // ускоряет отдачу озвучки, но проходит через отдельный, менее стабильный
  // путь генерации на стороне Fish. fast=false — параметры, максимально
  // близкие к дефолтам Fish (тот же режим, что использовался изначально
  // и был подтверждённо стабилен) — используется как автоматический
  // fallback при сбое «быстрого» пути (см. requestFish).
  private buildRequestBody(text: string, voice: string | undefined, speed: number, fast: boolean): string {
    const body: Record<string, unknown> = {
      text,
      format: 'mp3',
      // latency: 'balanced' — быстрее дефолтного 'normal', при этом
      // задокументированное и уже проверенное в проде значение для именно
      // этого эндпоинта (POST /v1/tts). Держим его в ОБОИХ режимах — это
      // не то, что вызывало сбои (см. ниже про chunk_length/mp3_bitrate).
      latency: 'balanced',
      prosody: { speed },
    };
    if (fast) {
      // Проблема: агрессивная связка chunk_length (ниже дефолта 200) +
      // mp3_bitrate 64 иногда роняет генерацию на стороне Fish с HTTP 500
      // ("Low latency decode failed... VQGAN decode failed" — их
      // внутренний вокодер-кластер для быстрого пути периодически
      // недоступен). Оставляем эту связку как ПЕРВУЮ попытку ради
      // скорости в штатном случае, но requestFish теперь автоматически
      // повторяет запрос с fast=false (Fish-дефолты) при сбое именно
      // этого пути — так и скорость сохраняется, и чат не виснет из-за
      // временной нестабильности быстрого декодера Fish.
      body.chunk_length = 130;
      body.mp3_bitrate = 64;
    }
    // reference_id не передаём вовсе, если голос не выбран — Fish в этом
    // случае использует голос модели по умолчанию, это валидный запрос.
    if (voice) body.reference_id = voice;
    return JSON.stringify(body);
  }

  // Статусы, при которых имеет смысл ОДИН автоматический повтор с
  // безопасными (Fish-дефолтными) параметрами — это транзиентные сбои
  // на стороне Fish (перегруженный/упавший под-сервис быстрого декодера),
  // а не проблема с ключом/балансом/лимитом, которые повторять бессмысленно.
  private isRetryableStatus(status: number): boolean {
    return status === 500 || status === 502 || status === 503 || status === 504;
  }

  private async requestFishOnce(text: string, voice: string | undefined, speed: number, fast: boolean): Promise<Response> {
    const apiKey = this.apiKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Полезно видеть в логах, ушёл ли reference_id вообще — если голос
    // регулярно звучит «роботизированно» независимо от выбора в UI, это
    // первое, что нужно проверить: либо на бэкенд не долетает voice
    // (баг на фронте/DTO), либо сам список голосов пуст (см. listVoices).
    console.log(`[FishAudioTtsService] синтез (${fast ? 'fast' : 'safe-fallback'}), reference_id=${voice || '(нет — голос модели по умолчанию)'}`);
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
        body: this.buildRequestBody(text, voice, speed, fast),
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        throw new ServiceUnavailableException('Fish Audio не ответил вовремя');
      }
      throw new ServiceUnavailableException('Сбой сети при обращении к Fish Audio');
    }
    clearTimeout(timer);
    return response;
  }

  private async requestFish(text: string, voice: string | undefined, speed: number, emotion?: string): Promise<Response> {
    const v = this.validate(text, speed);
    // Fish S2 понимает указания подачи, записанные прямо в тексте в
    // квадратных скобках, и не произносит их вслух — это официальный
    // способ управлять эмоцией, отдельного параметра в API нет.
    const spoken = emotion ? `[${emotion}] ${text}` : text;

    let response = await this.requestFishOnce(spoken, voice, v.speed, true);
    if (!response.ok && this.isRetryableStatus(response.status)) {
      const errorBody = await response.text().catch(() => '');
      console.warn(`[FishAudioTtsService] быстрый путь ответил HTTP ${response.status}, повторяю с безопасными параметрами:`, errorBody.slice(0, 300));
      response = await this.requestFishOnce(spoken, voice, v.speed, false);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[FishAudioTtsService] HTTP ${response.status}:`, errorBody.slice(0, 500));
      if (response.status === 401) throw new ServiceUnavailableException('Ключ Fish Audio недействителен');
      if (response.status === 402) throw new ServiceUnavailableException('На балансе Fish Audio закончились кредиты');
      if (response.status === 429) throw new ServiceUnavailableException('Слишком много запросов к Fish Audio. Попробуй через минуту.');
      throw new ServiceUnavailableException(`Ошибка Fish Audio TTS: HTTP ${response.status}`);
    }
    return response;
  }

  // Буферизованный синтез — основной путь. Тот же паттерн, что и у
  // OpenAI-провайдера: контроллер сейчас всегда использует именно его
  // (см. комментарий про Cloudflare в tts.controller.ts), не streamTo().
  // Теперь сначала проверяем audioCache — при повторном запросе того же
  // текста+голоса+скорости отдаём мгновенно, без обращения к Fish вообще.
  async synthesize(text: string, voice: string | undefined, speed: number = 1.0, emotion?: string): Promise<Buffer> {
    // Подача (эмоция) — часть входа модели, значит и часть ключа кэша:
    // иначе одна и та же фраза, произнесённая «спокойно» и «энергично»,
    // отдавалась бы из кэша одинаковой.
    const cacheKey = this.audioCacheKey(emotion ? `${emotion}::${text}` : text, voice, speed);
    const cached = this.readAudioCache(cacheKey);
    if (cached) return cached;

    const response = await this.requestFish(text, voice, speed, emotion);
    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    this.writeAudioCache(cacheKey, buf);
    return buf;
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

  // Ищет ОДИН голос в публичной библиотеке Fish по текстовому запросу.
  // page_size=5 — берём небольшой запас на случай, если самый релевантный
  // результат не первый в выдаче; используем первый, т.к. Fish уже
  // сортирует по релевантности при заданном title.
  private async searchVoice(apiKey: string, query: string): Promise<{ id: string; title: string } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.voiceSearchTimeoutMs);
    try {
      const url = `${VOICES_URL}?title=${encodeURIComponent(query)}&page_size=5`;
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      clearTimeout(timer);
      if (!response.ok) return null;
      const data: any = await response.json().catch(() => null);
      const first = Array.isArray(data?.items) ? data.items[0] : null;
      const id = first?._id || first?.id;
      if (!id) return null;
      return { id, title: first?.title || query };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  // Резолвит один пункт курируемого списка: перебирает queries по порядку,
  // пока какой-нибудь запрос не найдёт совпадение в каталоге Fish.
  // Возвращает готовый FishVoice с НАШИМ именем и описанием (не сырым
  // тайтлом из каталога Fish).
  private async resolveCuratedVoice(apiKey: string, def: CuratedVoiceDef): Promise<FishVoice | null> {
    for (const q of def.queries) {
      const found = await this.searchVoice(apiKey, q);
      if (found) return { id: found.id, title: def.name, description: def.description };
    }
    console.warn(`[FishAudioTtsService/listVoices] голос не найден в каталоге: "${def.queries[0]}" (перебрано запросов: ${def.queries.length})`);
    return null;
  }

  // Список голосов для UI выбора голоса (VoiceSettings). Теперь это не
  // «топ по популярности» из общей библиотеки Fish, а курируемый набор
  // (см. CURATED_VOICES) — каждый резолвится поиском по названию и
  // переименовывается в понятное английское имя + краткое описание тембра.
  // Кэшируем на процесс (см. voicesCache выше). При полном сбое сети/ключа
  // отдаём последний успешный кэш, если он есть — интерфейс не должен
  // падать из-за временной недоступности Fish API.
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

    // Резолвим все 9 голосов параллельно — иначе открытие настроек
    // озвучки ждало бы 9 последовательных round-trip'ов до Fish.
    const settled = await Promise.allSettled(
      CURATED_VOICES.map((def) => this.resolveCuratedVoice(apiKey, def)),
    );
    const items: FishVoice[] = settled
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((v): v is FishVoice => !!v);

    if (!items.length) {
      // Ни один курируемый голос не нашёлся (ключ/сеть/каталог недоступен
      // целиком) — не оставляем UI совсем без голосов, отдаём последний
      // рабочий кэш, если есть.
      console.warn('[FishAudioTtsService/listVoices] курируемые голоса не резолвнулись, отдаю последний кэш');
      return this.voicesCache?.items ?? [];
    }

    this.voicesCache = { at: Date.now(), items };
    console.log(`[FishAudioTtsService/listVoices] резолвнуто курируемых голосов: ${items.length}/${CURATED_VOICES.length}`);
    return items;
  }
}
