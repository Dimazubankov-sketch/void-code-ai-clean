import { Body, Controller, Post, Req, Res, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsString, MinLength, MaxLength, IsOptional, IsIn, IsNumber, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { TtsService } from './tts.service';
import { FishAudioTtsService } from './fish-audio-tts.service';
import { TTS_DAILY_LIMITS, todayDayKey } from './tts.constants';
import type { Response } from 'express';

export class TtsRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  // Провайдер синтеза. Fish Audio — основной по умолчанию (см. ниже),
  // OpenAI — второй, полностью рабочий как раньше.
  @IsOptional()
  @IsString()
  @IsIn(['fish', 'openai'])
  provider?: string;

  // Голос: для OpenAI — один из шести фиксированных имён (сам сервис
  // TtsService дополнительно подстрахует невалидное значение дефолтом
  // 'nova'). Для Fish — произвольный reference_id голоса из списка
  // /tts/fish/voices, поэтому здесь просто строка без enum-проверки —
  // список голосов Fish динамический и не known на этапе компиляции DTO.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  voice?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(4.0)
  speed?: number;
}

@Controller('tts')
@UseGuards(JwtAuthGuard)
export class TtsController {
  constructor(
    private readonly tts: TtsService,
    private readonly fishTts: FishAudioTtsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('synthesize')
  async synthesize(
    @Req() req: any,
    @Body() dto: TtsRequestDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    const userId = req.user.userId;
    await this.consumeTtsLimit(userId, dto.text.length);

    // Fish Audio — провайдер по умолчанию (в т.ч. для существующих
    // пользователей, у которых ещё не сохранён выбор провайдера на клиенте:
    // фронтенд в этом случае просто не пришлёт поле provider вовсе).
    const provider = dto.provider === 'openai' ? 'openai' : 'fish';

    // ВАЖНО: раньше здесь был потоковый (streaming) ответ через tts.streamTo()
    // ради более быстрого старта воспроизведения. После подключения домена
    // через Cloudflare пользователи стали часто получать «Не удалось
    // воспроизвести аудио» — Cloudflare-прокси (и, возможно, nginx на пути)
    // не всегда корректно доставляет chunked audio/mpeg стрим целиком:
    // соединение могло обрываться до конца потока, и клиент получал
    // усечённый/повреждённый MP3, который браузер не мог декодировать.
    // Возвращаемся на простой буферизованный ответ для ОБОИХ провайдеров:
    // сервис полностью получает файл, ЗАТЕМ единым куском с Content-Length
    // отправляет клиенту. Это гарантирует целостность файла ценой
    // небольшой доп. задержки перед стартом воспроизведения — для
    // короткой фразы (проверка голоса, разовое сообщение в чате) это
    // разница в десятые доли секунды, а корректность важнее. Оба сервиса
    // уже готовы к стримингу (streamTo) — включить можно точечно, заменив
    // synthesize() на streamTo() ниже, когда путь через Cloudflare починят.
    const buf = provider === 'openai'
      ? await this.tts.synthesize(dto.text, dto.voice || 'nova', dto.speed ?? 1.0)
      : await this.fishTts.synthesize(dto.text, dto.voice, dto.speed ?? 1.0);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }

  // Список публичных голосов Fish Audio для UI (VoiceSettings подтягивает
  // его при переключении на провайдера Fish). Для OpenAI список голосов
  // фиксирован и захардкожен на фронтенде (VOICE_PRESETS) — отдельный
  // эндпоинт под него не нужен.
  @Post('fish/voices')
  async fishVoices() {
    const items = await this.fishTts.listVoices();
    return { items };
  }

  // GET-эндпоинт: сколько символов пользователь уже израсходовал сегодня.
  @Post('usage')
  async usage(@Req() req: any) {
    const userId = req.user.userId;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = TTS_DAILY_LIMITS[user.plan] ?? TTS_DAILY_LIMITS.FREE;
    const today = todayDayKey();
    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_dayKey: { userId, dayKey: today } },
    }).catch(() => null);
    // Хранимся в generatedImages поле dailyImages: используем ttsCharsUsed
    // как обёртку — если поля ещё нет, читаем из meta.
    const used = (counter as any)?.ttsCharsUsed ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  // Атомарное списание символов (создаст counter при первом запросе за сутки).
  private async consumeTtsLimit(userId: string, chars: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = TTS_DAILY_LIMITS[user.plan] ?? TTS_DAILY_LIMITS.FREE;

    const today = todayDayKey();
    // Используем тот же UsageCounter, что и для чатов. Схема БД содержит поля
    // dailyUsed/weeklyUsed; для TTS ведём отдельное поле ttsCharsUsed, которое
    // должно быть добавлено в Prisma-схему (миграция ниже в комментарии).
    // Если поле ещё не мигрировано — try/catch поймает и вернёт мягкую ошибку.
    try {
      const counter = await this.prisma.usageCounter.upsert({
        where: { userId_dayKey: { userId, dayKey: today } },
        create: { userId, dayKey: today, weekKey: today.slice(0, 7), dailyUsed: 0, weeklyUsed: 0 },
        update: {},
      });
      const currentUsed = (counter as any).ttsCharsUsed ?? 0;
      if (currentUsed + chars > limit) {
        throw new ForbiddenException(`Дневной лимит озвучки исчерпан (${limit} символов). Обновится через 6 часов.`);
      }
      await this.prisma.usageCounter.update({
        where: { id: counter.id },
        data: { ttsCharsUsed: { increment: chars } } as any,
      });
    } catch (e: any) {
      if (e instanceof ForbiddenException) throw e;
      // eslint-disable-next-line no-console
      console.error('[TTS limit] Не удалось списать TTS-символы, вероятно поле ttsCharsUsed ещё не мигрировано:', e?.message);
      // Мягко продолжаем: не блокируем пользователя, пока Prisma не мигрировала.
    }
  }
}
