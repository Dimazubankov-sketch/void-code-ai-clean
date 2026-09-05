import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { MediaCacheService } from './media-cache.service';

// ==========================================
// MediaCacheController — публичная раздача (БЕЗ JwtAuthGuard)
// ==========================================
// Намеренно отдельный контроллер, а не метод внутри VideoController: у
// того на уровне класса висит @UseGuards(JwtAuthGuard), и в NestJS его
// нельзя «снять» для одного конкретного маршрута иначе как вынеся
// маршрут в контроллер без гварда. OpenRouter (для audio-референса) и
// video/audio-теги в браузере пользователя не могут ходить с JWT в
// заголовке — им нужен обычный публичный URL.
@Controller('media')
export class MediaCacheController {
  constructor(private readonly cache: MediaCacheService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    const item = this.cache.get(id);
    if (!item) throw new NotFoundException('Файл не найден или истёк срок хранения');
    res.setHeader('Content-Type', item.mime);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', String(item.buf.length));
    res.end(item.buf);
  }
}
