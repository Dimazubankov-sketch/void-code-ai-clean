import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { GeminiProvider } from './providers/gemini.provider';
import { LLM_PROVIDER } from './providers/llm-provider.interface';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    // Сменить провайдера = поменять одну строку (useClass: OpenRouterProvider)
    { provide: LLM_PROVIDER, useClass: GeminiProvider },
    GeminiProvider,
  ],
  exports: [LLM_PROVIDER],
})
export class ChatModule {}
