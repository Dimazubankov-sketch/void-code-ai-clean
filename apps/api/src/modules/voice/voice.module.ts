import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { VoiceComplianceService } from './voice-compliance.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [VoiceController],
  providers: [VoiceService, VoiceComplianceService],
  exports: [VoiceService],
})
export class VoiceModule {}
