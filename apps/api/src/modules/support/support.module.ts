import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

// ChatModule экспортирует LLM_PROVIDER (роутинг Void Mini/Plus/Pro) —
// переиспользуем его вместо дублирования провайдеров.
@Module({
  imports: [ChatModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
