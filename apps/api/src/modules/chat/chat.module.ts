import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { LLM_PROVIDER } from './providers/llm-provider.interface';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    // Сменить провайдера = поменять одну строку (useClass: GeminiProvider)
    { provide: LLM_PROVIDER, useClass: GroqProvider },
    GeminiProvider,
    GroqProvider,
  ],
  exports: [LLM_PROVIDER],
})
export class ChatModule {}
