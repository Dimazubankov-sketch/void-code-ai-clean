import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { RoutingLlmProvider } from './providers/routing.provider';
import { LLM_PROVIDER } from './providers/llm-provider.interface';

@Module({
  controllers: [ChatController],
  providers: [
    ChatService,
    GeminiProvider,
    GroqProvider,
    OpenRouterProvider,
    RoutingLlmProvider,
    // Активный провайдер — роутинг:
    //   Void Mini  → Groq (быстрая линия, ≤3с)
    //   Void Plus  → OpenRouter/Qwen 2.5 Coder 32B
    //   Void Pro   → OpenRouter/Qwen 2.5 72B
    // С автоматическим фолбэком на второй провайдер при сбое основного.
    { provide: LLM_PROVIDER, useClass: RoutingLlmProvider },
  ],
  exports: [LLM_PROVIDER],
})
export class ChatModule {}
