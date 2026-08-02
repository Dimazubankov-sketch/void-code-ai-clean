import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { LLM_PROVIDER } from './providers/llm-provider.interface';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    // Активный провайдер — OpenRouter (модели Qwen 2.5 Coder для Plus/Pro).
    // Сменить провайдера = поменять одну строку (useClass).
    { provide: LLM_PROVIDER, useClass: OpenRouterProvider },
    GeminiProvider,
    GroqProvider,
    OpenRouterProvider,
  ],
  exports: [LLM_PROVIDER],
})
export class ChatModule {}
