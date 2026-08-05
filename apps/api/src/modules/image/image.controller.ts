import { Body, Controller, Post, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength, MaxLength, ArrayMaxSize } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ImageService } from './image.service';

// Лимиты генерации картинок в сутки. Множители соответствуют общим x2/x5/x10.
export const IMAGE_DAILY_LIMITS: Record<string, number> = {
  FREE:  3,
  PLUS:  6,
  PRO:   15,
  ULTRA: 30,
};

class GenerateImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;

  // Референсные фото для Image-to-Image (режим «Генерация изображений» с
  // прикреплёнными картинками) — data-URL base64, максимум 4 штуки за раз.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  images?: string[];
}

@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImageController {
  constructor(
    private readonly image: ImageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('generate')
  async generate(@Req() req: any, @Body() dto: GenerateImageDto) {
    await this.consumeImageLimit(req.user.userId);
    const url = await this.image.generate(dto.prompt, dto.images);
    return { url };
  }

  @Post('usage')
  async usage(@Req() req: any) {
    const userId = req.user.userId;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = IMAGE_DAILY_LIMITS[user.plan] ?? IMAGE_DAILY_LIMITS.FREE;
    const today = new Date().toISOString().slice(0, 10);
    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_dayKey: { userId, dayKey: today } },
    }).catch(() => null);
    const used = (counter as any)?.imagesUsed ?? 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  }

  private async consumeImageLimit(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = IMAGE_DAILY_LIMITS[user.plan] ?? IMAGE_DAILY_LIMITS.FREE;

    const today = new Date().toISOString().slice(0, 10);
    try {
      const counter = await this.prisma.usageCounter.upsert({
        where: { userId_dayKey: { userId, dayKey: today } },
        create: { userId, dayKey: today, weekKey: today.slice(0, 7), dailyUsed: 0, weeklyUsed: 0 },
        update: {},
      });
      const currentUsed = (counter as any).imagesUsed ?? 0;
      if (currentUsed >= limit) {
        throw new ForbiddenException(`Дневной лимит генерации картинок исчерпан (${limit}). Обновится через 6 часов.`);
      }
      await this.prisma.usageCounter.update({
        where: { id: counter.id },
        data: { imagesUsed: { increment: 1 } } as any,
      });
    } catch (e: any) {
      if (e instanceof ForbiddenException) throw e;
      // eslint-disable-next-line no-console
      console.error('[Image limit] Не удалось списать, вероятно поле imagesUsed ещё не мигрировано:', e?.message);
    }
  }
}
