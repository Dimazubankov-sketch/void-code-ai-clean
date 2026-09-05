import { Module } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { FishAudioTtsService } from './fish-audio-tts.service';

@Module({
  controllers: [TtsController],
  providers: [TtsService, FishAudioTtsService],
  // Экспортируем FishAudioTtsService — VideoModule переиспользует его же
  // (существующие голоса + synthesize + новый designVoice) для
  // видео-пайплайна со своим голосом, не дублируя логику Fish API.
  exports: [FishAudioTtsService],
})
export class TtsModule {}
