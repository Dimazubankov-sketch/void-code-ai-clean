import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { MediaCacheController } from './media-cache.controller';
import { MediaCacheService } from './media-cache.service';
import { AudioMuxService } from './audio-mux.service';
import { TtsModule } from '../tts/tts.module';

@Module({
  imports: [TtsModule],
  controllers: [VideoController, MediaCacheController],
  providers: [VideoService, MediaCacheService, AudioMuxService],
  exports: [VideoService],
})
export class VideoModule {}
