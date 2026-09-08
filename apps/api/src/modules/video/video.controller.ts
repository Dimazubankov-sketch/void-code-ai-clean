import { Body, Controller, Get, Param, Post, Req, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { VideoService, VIDEO_MODELS } from './video.service';

// Лимиты генерации видео в сутки. Видео заметно дороже картинок
// ($0.05–0.14/сек у провайдера), поэтому лимиты строже — по аналогии с
// IMAGE_DAILY_LIMITS. На Free доступно ОДНО видео в сутки, но только в
// «облегчённом» формате: не длиннее FREE_MAX_VIDEO_DURATION секунд и не
// выше FREE_MAX_VIDEO_RESOLUTION (см. enforceFreeVideoConstraints ниже).
// Так функция становится доступна для ознакомления, но её стоимость на
// бесплатном тарифе остаётся под жёстким контролем.
export const VIDEO_DAILY_LIMITS: Record<string, number> = {
  FREE:  1,
  PLUS:  2,
  PRO:   5,
  ULTRA: 12,
};

// Ограничения бесплатного тарифа на видео (задача 6): 720p и не длиннее 6с.
const FREE_MAX_VIDEO_DURATION = 6;
const FREE_MAX_VIDEO_RESOLUTION = '720p';

class GenerateVideoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  prompt!: string;

  @IsIn(VIDEO_MODELS as unknown as string[])
  model!: string;

  @IsOptional()
  @IsString()
  aspectRatio?: string;

  // Верхняя граница — максимум среди моделей (Seedance 2.5, до 30с).
  // Точный лимит для конкретной модели (2.0 — 15с) проверяется отдельно
  // в VideoService.submit (MODEL_MAX_DURATION).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  duration?: number;

  @IsOptional()
  @IsIn(['480p', '720p'])
  resolution?: string;

  // Первый кадр для image-to-video — data-URL с превью, которое уже
  // прикрепил пользователь (та же схема, что и референсы у картинок).
  @IsOptional()
  @IsString()
  imageUrl?: string;

  // Свой голос (Fish Audio) — см. VideoService.resolveVoiceAudio.
  // 'existing' требует voiceId, 'design' требует voiceDescription; в
  // обоих случаях нужен script (реплика, которую озвучит голос).
  @IsOptional()
  @IsIn(['none', 'existing', 'design'])
  voiceMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  voiceDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  script?: string;
}

@Controller('videos')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(
    private readonly video: VideoService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('generate')
  async generate(@Req() req: any, @Body() dto: GenerateVideoDto) {
    // Ограничения бесплатного тарифа проверяем ДО списания кредита, чтобы
    // не «сжечь» единственную дневную попытку на заведомо отклонённом
    // запросе (слишком длинное видео/высокое разрешение на Free).
    await this.enforceFreeVideoConstraints(req.user.userId, dto);
    await this.consumeVideoLimit(req.user.userId);
    if (dto.voiceMode && dto.voiceMode !== 'none') {
      await this.requireVoicePlan(req.user.userId);
    }
    return this.video.submit({
      prompt: dto.prompt,
      model: dto.model,
      aspectRatio: dto.aspectRatio,
      duration: dto.duration,
      resolution: dto.resolution,
      imageUrl: dto.imageUrl,
      voiceMode: dto.voiceMode as any,
      voiceId: dto.voiceId,
      voiceDescription: dto.voiceDescription,
      script: dto.script,
    });
  }

  // Клиент опрашивает этот эндпоинт сам (каждые несколько секунд) —
  // каждый вызов быстрый, поэтому долгая генерация не рискует упереться
  // в таймаут прокси/Cloudflare (см. комментарий в video.service.ts).
  @Get('status/:jobId')
  async status(@Param('jobId') jobId: string) {
    if (!jobId) throw new BadRequestException('jobId обязателен');
    return this.video.pollOnce(jobId);
  }

  @Post('usage')
  async usage(@Req() req: any) {
    const userId = req.user.userId;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = VIDEO_DAILY_LIMITS[user.plan] ?? VIDEO_DAILY_LIMITS.FREE;
    const today = new Date().toISOString().slice(0, 10);
    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_dayKey: { userId, dayKey: today } },
    }).catch(() => null);
    const used = (counter as any)?.videosUsed ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  // Свой голос — Fish Voice Design/synthesize + доп. Seedance-запрос на
  // дозвучку заметно дороже обычной генерации видео, поэтому доступен
  // только Pro/Ultra (как и указано в ТЗ), а не всем, кому в принципе
  // открыто видео (Plus).
  private async requireVoicePlan(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.plan !== 'PRO' && user.plan !== 'ULTRA') {
      throw new ForbiddenException('Свой голос в видео доступен на тарифах Pro и Ultra.');
    }
  }

  // Задача 6: на Free видео разрешено, но строго 720p и ≤6с. Платные
  // тарифы этих ограничений не имеют.
  private async enforceFreeVideoConstraints(userId: string, dto: GenerateVideoDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.plan !== 'FREE') return;
    if ((dto.duration ?? FREE_MAX_VIDEO_DURATION) > FREE_MAX_VIDEO_DURATION) {
      throw new BadRequestException(
        `На тарифе Free длительность видео — не более ${FREE_MAX_VIDEO_DURATION} секунд. Перейдите на Plus для длинных роликов.`,
      );
    }
    if (dto.resolution && dto.resolution !== FREE_MAX_VIDEO_RESOLUTION && dto.resolution !== '480p') {
      throw new BadRequestException('На тарифе Free доступно качество до 720p.');
    }
    if (dto.voiceMode && dto.voiceMode !== 'none') {
      throw new ForbiddenException('Своя озвучка видео недоступна на тарифе Free.');
    }
  }

  private async consumeVideoLimit(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = VIDEO_DAILY_LIMITS[user.plan] ?? VIDEO_DAILY_LIMITS.FREE;
    if (limit <= 0) {
      throw new ForbiddenException('Генерация видео недоступна на вашем тарифе. Перейдите на Plus и выше.');
    }

    const today = new Date().toISOString().slice(0, 10);
    try {
      const counter = await this.prisma.usageCounter.upsert({
        where: { userId_dayKey: { userId, dayKey: today } },
        create: { userId, dayKey: today, weekKey: today.slice(0, 7), dailyUsed: 0, weeklyUsed: 0 },
        update: {},
      });
      const currentUsed = (counter as any).videosUsed ?? 0;
      if (currentUsed >= limit) {
        throw new ForbiddenException(`Дневной лимит генерации видео исчерпан (${limit}). Обновится через 6 часов.`);
      }
      await this.prisma.usageCounter.update({
        where: { id: counter.id },
        data: { videosUsed: { increment: 1 } } as any,
      });
    } catch (e: any) {
      if (e instanceof ForbiddenException) throw e;
      // eslint-disable-next-line no-console
      console.error('[Video limit] Не удалось списать, вероятно поле videosUsed ещё не мигрировано:', e?.message);
    }
  }
}
