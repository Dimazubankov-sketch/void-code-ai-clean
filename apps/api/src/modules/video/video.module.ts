import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { MediaCacheController } from './media-cache.controller';
import { MediaCacheService } from './media-cache.service';
import { VideoFileController } from './video-file.controller';
import { VideoStorageService } from './video-storage.service';
import { AudioMuxService } from './audio-mux.service';
import { TtsModule } from '../tts/tts.module';

@Module({
  imports: [TtsModule],
  controllers: [VideoController, MediaCacheController, VideoFileController],
  providers: [VideoService, MediaCacheService, AudioMuxService, VideoStorageService],
  exports: [VideoService],
})
export class VideoModule {}
