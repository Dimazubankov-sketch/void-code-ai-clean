import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmProvider, LlmRequest } from './llm-provider.interface';
import { GroqProvider } from './groq.provider';
import { OpenRouterProvider } from './openrouter.provider';

// ==========================================
// Роутинг-провайдер по внутреннему ID модели
// ==========================================
// Void Mini → Groq (llama-3.3-70b-versatile): у Groq рекордно низкая
// латентность (сотни tok/s), для быстрых коротких ответов лучший выбор
// по цели «отклик ≤ 3с».
// Void Plus / Void Pro → OpenRouter (Qwen 2.5 Coder / Qwen 2.5 72B):
// сильнее на коде и рассуждениях, чем Groq/Llama, но чуть медленнее.
//
// Если запрошенный провайдер упал (например, OpenRouter временно 5xx) —
// делаем один автоматический откат на второго. Это заметно повышает
// стабильность без риска «залочить» пользователя в поломанной модели.
@Injectable()
export class RoutingLlmProvider implements LlmProvider {
  readonly name = 'routing';

  constructor(
    private readonly groq: GroqProvider,
    private readonly openrouter: OpenRouterProvider,
  ) {}

  async generate(req: LlmRequest): Promise<string> {
    const model = (req.model || '').toLowerCase();
    // Разделение линий строго по модели:
    //   Void Mini (flash/mini) → Groq/llama-3.3-70b — быстрые короткие
    //     ответы, ≤3с латентность.
    //   Void Plus (flash_ext/plus) → OpenRouter/qwen-2.5-coder-32b —
    //     специализирован на коде. Скорость обеспечивается через
    //     provider.sort='throughput' + разумный max_tokens=4096 в
    //     самом OpenRouterProvider (не сменой модели на Groq).
    //   Void Pro → OpenRouter/qwen3-coder.
    const useGroqFirst = model === 'flash' || model === 'mini';

    const primary = useGroqFirst ? this.groq : this.openrouter;
    const fallback = useGroqFirst ? this.openrouter : this.groq;

    try {
      return await primary.generate(req);
    } catch (primaryErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[RoutingLlmProvider] primary=${primary.name} failed, fallback=${fallback.name}:`,
        (primaryErr as Error)?.message,
      );
      try {
        return await fallback.generate(req);
      } catch (fallbackErr) {
        // eslint-disable-next-line no-console
        console.error(
          `[RoutingLlmProvider] fallback=${fallback.name} also failed:`,
          (fallbackErr as Error)?.message,
        );
        throw new ServiceUnavailableException('Провайдеры недоступны, попробуй ещё раз');
      }
    }
  }
}
