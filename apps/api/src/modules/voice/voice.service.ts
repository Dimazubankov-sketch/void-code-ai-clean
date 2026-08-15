import { Injectable, ForbiddenException, BadRequestException, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { todayDayKey } from '../tts/tts.constants';
import { VoiceComplianceService } from './voice-compliance.service';

// ==========================================
// Создание пользовательских голосов (Fish Audio)
// ==========================================
// Два официально поддерживаемых Fish способа, никаких выдуманных эндпоинтов:
//   • КЛОНИРОВАНИЕ — POST https://api.fish.audio/model, multipart:
//     type=tts, title, voices=<аудиофайл>. В ответ приходит _id модели.
//   • ГЕНЕРАЦИЯ ПО ОПИСАНИЮ — POST https://api.fish.audio/v1/voice-design
//     с заголовком model: voice-design-1 и телом {instruction,
//     reference_text, language, n}. Возвращает КАНДИДАТОВ (WAV в base64),
//     а не готовую модель. Поэтому постоянный голос из выбранного
//     кандидата мы создаём тем же POST /model, отправляя его аудио как
//     сэмпл — это штатный путь, а не обходной.
//
// Ключ Fish живёт только здесь, в окружении сервера, и во фронтенд не
// попадает ни в каком виде.
const FISH_MODEL_URL = 'https://api.fish.audio/model';
const FISH_VOICE_DESIGN_URL = 'https://api.fish.audio/v1/voice-design';

// ------------------------------------------------------------------
// Единственное место, где заданы лимиты и доступность создания голосов.
// Менять только здесь — по коду значения больше нигде не продублированы.
export const VOICE_CREATION_LIMITS: Record<string, number> = {
  FREE: 0,    // создание голоса недоступно без подписки
  PLUS: 2,
  PRO: 3,
  ULTRA: 6,
};

// Данные о согласии и клиенте, сопровождающие каждый запрос на создание.
export interface ConsentMeta {
  consent: boolean;
  ip?: string;
  userAgent?: string;
}

export function voiceCreationLimit(plan?: string): number {
  const p = (plan || 'FREE').toUpperCase();
  return VOICE_CREATION_LIMITS[p] ?? VOICE_CREATION_LIMITS.FREE;
}

@Injectable()
export class VoiceService {
  private readonly timeoutMs = 120_000; // обучение модели у Fish не мгновенное

  private apiKey(): string {
    const key = process.env.FISH_AUDIO_API_KEY;
    if (!key) throw new ServiceUnavailableException('Fish Audio не сконфигурирован');
    return key;
  }

  // Разбирает data-URL (audio/wav;base64,...) в бинарь. Аудио приходит с
  // фронта именно так — тем же способом, что и фото в остальных модулях,
  // чтобы не тащить multer ради одного эндпоинта.
  private decodeAudio(dataUrl: string): { buf: Buffer; mime: string } {
    const m = /^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
    if (!m) throw new BadRequestException('Ожидается аудио в формате data-URL');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) throw new BadRequestException('Пустая аудиозапись');
    // 30 секунд качественного аудио — единицы мегабайт; потолок с запасом.
    if (buf.length > 12 * 1024 * 1024) throw new BadRequestException('Запись слишком большая (максимум ~12 МБ)');
    return { buf, mime: m[1] };
  }

  // ---- Проверка подписки и суточного лимита ----
  // Обе проверки ТОЛЬКО здесь, на сервере: значениям тарифа и остатка
  // лимита, пришедшим с фронта, не доверяем вовсе — они там лишь для
  // отрисовки интерфейса.
  private async assertCanCreate(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = voiceCreationLimit(user.plan);
    if (limit <= 0) {
      throw new ForbiddenException('Создание собственного голоса доступно на платных тарифах');
    }

    const dayKey = todayDayKey();
    // Атомарный инкремент вместо «прочитали → сравнили → записали»:
    // иначе несколько одновременных запросов проскочили бы мимо лимита.
    const counter = await this.prisma.usageCounter.upsert({
      where: { userId_dayKey: { userId, dayKey } },
      create: { userId, dayKey, weekKey: dayKey.slice(0, 7), voicesCreated: 1 } as any,
      update: { voicesCreated: { increment: 1 } } as any,
    });
    const used = (counter as any).voicesCreated ?? 1;
    if (used > limit) {
      // Откатываем «занятый» слот — попытка не состоялась.
      await this.prisma.usageCounter.update({
        where: { id: counter.id },
        data: { voicesCreated: { decrement: 1 } } as any,
      });
      throw new ForbiddenException('Дневной лимит создания голосов исчерпан. Попробуйте завтра.');
    }
    return counter.id;
  }

  // Освободить слот, если создание в итоге не удалось — иначе неудачная
  // попытка съедала бы дневной лимит.
  private async releaseSlot(counterId: string) {
    try {
      await this.prisma.usageCounter.update({
        where: { id: counterId },
        data: { voicesCreated: { decrement: 1 } } as any,
      });
    } catch { /* счётчик мог быть уже сброшен — не критично */ }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: VoiceComplianceService,
  ) {}

  // ---- Создание модели голоса в Fish из аудио ----
  private async createFishModel(title: string, audio: Buffer, mime: string, description?: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      form.append('type', 'tts');
      form.append('title', title.slice(0, 60));
      form.append('visibility', 'private'); // чужим голос не виден
      form.append('train_mode', 'fast');
      form.append('enhance_audio_quality', 'true');
      if (description) form.append('description', description.slice(0, 400));
      const ext = mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : 'webm';
      form.append('voices', new Blob([new Uint8Array(audio)], { type: mime }), `sample.${ext}`);

      const response = await fetch(FISH_MODEL_URL, {
        method: 'POST',
        signal: controller.signal,
        // Content-Type НЕ задаём вручную: boundary должен проставить fetch.
        headers: { Authorization: `Bearer ${this.apiKey()}` },
        body: form,
      });
      clearTimeout(timer);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[VoiceService/createFishModel] HTTP ${response.status}:`, body.slice(0, 400));
        if (response.status === 402) throw new ServiceUnavailableException('На балансе Fish Audio закончились кредиты');
        if (response.status === 401) throw new ServiceUnavailableException('Ключ Fish Audio недействителен');
        throw new ServiceUnavailableException(`Fish Audio не смог создать голос (HTTP ${response.status})`);
      }
      const data: any = await response.json();
      const id = data?._id || data?.id;
      if (!id) throw new ServiceUnavailableException('Fish Audio не вернул идентификатор голоса');
      return String(id);
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') throw new ServiceUnavailableException('Fish Audio не ответил вовремя');
      throw e;
    }
  }

  // ---- 1. Клонирование голоса из записи пользователя ----
  async cloneVoice(userId: string, title: string, audioDataUrl: string, meta: ConsentMeta) {
    // Порядок важен: согласие и запрет проверяем ДО декодирования аудио и
    // до любого обращения к Fish — запрос к провайдеру без валидного
    // согласия уходить не должен вовсе.
    await this.compliance.assertConsentAndContent({
      userId, consent: meta.consent, title, ip: meta.ip, userAgent: meta.userAgent,
    });
    const { buf, mime } = this.decodeAudio(audioDataUrl);
    const counterId = await this.assertCanCreate(userId);
    try {
      const fishVoiceId = await this.createFishModel(title, buf, mime, 'Cloned from user recording');
      const voice = await this.prisma.userVoice.create({
        data: { userId, fishVoiceId, title: title.slice(0, 60), source: 'clone' },
      });
      await this.compliance.saveConsent({ userId, voiceId: voice.id, ip: meta.ip, userAgent: meta.userAgent });
      return voice;
    } catch (e) {
      await this.releaseSlot(counterId);
      throw e;
    }
  }

  // ---- 2а. Генерация кандидатов по описанию ----
  // Лимит здесь НЕ расходуется: это предпрослушка, постоянная модель ещё
  // не создаётся. Слот займётся на шаге сохранения (designSave).
  async designPreview(userId: string, instruction: string, referenceText: string, language: string, meta: ConsentMeta) {
    // Даже на этапе предпрослушки не даём описывать чужой/публичный голос.
    await this.compliance.assertConsentAndContent({
      userId, consent: true, title: instruction, ip: meta.ip, userAgent: meta.userAgent,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(FISH_VOICE_DESIGN_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey()}`,
          model: 'voice-design-1',
        },
        body: JSON.stringify({
          instruction: instruction.slice(0, 800),
          reference_text: referenceText.slice(0, 300),
          language,
          n: 2, // два варианта на выбор — как в самом Fish
        }),
      });
      clearTimeout(timer);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`[VoiceService/designPreview] HTTP ${response.status}:`, body.slice(0, 400));
        throw new ServiceUnavailableException(`Не удалось сгенерировать голос (HTTP ${response.status})`);
      }
      const data: any = await response.json();
      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      if (!candidates.length) throw new ServiceUnavailableException('Fish Audio не вернул варианты голоса');
      return candidates.map((c: any, i: number) => ({
        index: i,
        audioBase64: c.audio_base64,
        durationMs: c.duration_ms ?? null,
      }));
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') throw new ServiceUnavailableException('Fish Audio не ответил вовремя');
      throw e;
    }
  }

  // ---- 2б. Сохранение выбранного кандидата постоянным голосом ----
  async designSave(userId: string, title: string, audioBase64: string, instruction: string | undefined, meta: ConsentMeta) {
    await this.compliance.assertConsentAndContent({
      userId, consent: meta.consent, title, description: instruction, ip: meta.ip, userAgent: meta.userAgent,
    });
    if (!audioBase64) throw new BadRequestException('Не передан выбранный вариант голоса');
    const counterId = await this.assertCanCreate(userId);
    try {
      const buf = Buffer.from(audioBase64, 'base64');
      const fishVoiceId = await this.createFishModel(title, buf, 'audio/wav', instruction);
      const voice = await this.prisma.userVoice.create({
        data: { userId, fishVoiceId, title: title.slice(0, 60), source: 'design' },
      });
      await this.compliance.saveConsent({ userId, voiceId: voice.id, ip: meta.ip, userAgent: meta.userAgent });
      return voice;
    } catch (e) {
      await this.releaseSlot(counterId);
      throw e;
    }
  }

  // ---- Список / удаление ----
  async listVoices(userId: string) {
    return this.prisma.userVoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, fishVoiceId: true, title: true, source: true, createdAt: true },
    });
  }

  async deleteVoice(userId: string, id: string) {
    // Фильтр по userId обязателен: по чужому id удалить ничего нельзя.
    const voice = await this.prisma.userVoice.findFirst({ where: { id, userId } });
    if (!voice) throw new NotFoundException('Голос не найден');

    // Сначала пробуем убрать модель в Fish. Если не вышло (сеть, уже
    // удалена) — запись у себя всё равно удаляем, иначе голос навсегда
    // «залипнет» в списке пользователя.
    try {
      await fetch(`${FISH_MODEL_URL}/${voice.fishVoiceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey()}` },
      });
    } catch (e: any) {
      console.warn('[VoiceService/delete] не удалось удалить модель в Fish:', e?.message || e);
    }
    await this.prisma.userVoice.delete({ where: { id: voice.id } });
    return { ok: true };
  }

  // Остаток дневного лимита — для интерфейса.
  async quota(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = voiceCreationLimit(user.plan);
    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_dayKey: { userId, dayKey: todayDayKey() } },
    });
    const used = (counter as any)?.voicesCreated ?? 0;
    return { plan: user.plan, limit, used, remaining: Math.max(0, limit - used), allowed: limit > 0 };
  }
}
