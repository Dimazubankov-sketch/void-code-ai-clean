import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { VideoStorageService } from './video-storage.service';

// ==========================================
// VideoFileController — публичная раздача готовых видео (БЕЗ JwtAuthGuard)
// ==========================================
// Отдельный контроллер без гварда — тот же приём, что и у
// MediaCacheController: <video src=...> в браузере пользователя не может
// приложить JWT в заголовке, нужен обычный публичный URL. В отличие от
// MediaCacheController (in-memory, TTL 30 минут — для мимолётных
// audio-референсов), здесь файлы лежат на диске БЕЗ срока жизни — это
// постоянное хранилище для «Библиотеки» (см. VideoStorageService).
// Cache-Control длинный: готовое видео по данному id никогда не меняется.
@Controller('media/video')
export class VideoFileController {
  constructor(private readonly storage: VideoStorageService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.storage.resolvePath(id);
    if (!filePath) throw new NotFoundException('Видео не найдено');
    const { size } = await stat(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    createReadStream(filePath).pipe(res);
  }
}
