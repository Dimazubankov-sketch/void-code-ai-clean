import { Module } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { FishAudioTtsService } from './fish-audio-tts.service';

@Module({
  controllers: [TtsController],
  providers: [TtsService, FishAudioTtsService],
})
export class TtsModule {}
