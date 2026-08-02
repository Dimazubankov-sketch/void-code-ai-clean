import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmProvider, LlmRequest } from './llm-provider.interface';

// ==========================================
// Адаптер OpenRouter (OpenAI-совместимый чат-эндпоинт)
// ==========================================
// Ключ живёт ТОЛЬКО в переменных окружения сервера (OPENROUTER_API_KEY) —
// браузер пользователя его никогда не видит.
//
// Внутренние ID моделей фронтенда (mini/flash/plus/pro и т.п.) — это НЕ
// настоящие имена моделей. Пользователь и ИИ не должны знать реальную
// модель: наружу существуют только «Void Mini/Plus/Pro». Здесь мы
// сопоставляем внутренние ID с реальными моделями OpenRouter.
@Injectable()
export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter';

  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  // Void Plus → Qwen 2.5 Coder 32B (специализация на коде).
  // Void Pro → Qwen 2.5 72B (более крупная модель общего назначения;
  // у Qwen2.5-Coder нет варианта 72B — попытка использовать
  // "qwen-2.5-coder-72b-instruct" даёт HTTP 400, такой модели не существует).
  // Void Mini (быстрые/дешёвые ответы) — на младшей coder-модели.
  private readonly modelMap: Record<string, string> = {
    mini: 'qwen/qwen-2.5-coder-32b-instruct',
    flash: 'qwen/qwen-2.5-coder-32b-instruct',
    flash_ext: 'qwen/qwen-2.5-coder-32b-instruct',
    plus: 'qwen/qwen-2.5-coder-32b-instruct',
    pro: 'qwen/qwen-2.5-72b-instruct',
  };

  private readonly fallbackModel = 'qwen/qwen-2.5-coder-32b-instruct';

  async generate(req: LlmRequest): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('LLM-провайдер не сконфигурирован');

    const messages = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // OpenRouter рекомендует указывать источник запроса.
        'HTTP-Referer': process.env.APP_URL || 'https://void-code.ru',
        'X-Title': 'Void Code AI',
      },
      body: JSON.stringify({
        model: this.modelMap[req.model] || this.fallbackModel,
        messages,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      // Логируем тело ответа провайдера на сервере для диагностики
      // (неверный ID модели, лимиты, и т.п.), но наружу отдаём общий текст.
      const errorBody = await response.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(`[OpenRouterProvider] HTTP ${response.status}:`, errorBody.slice(0, 500));
      throw new ServiceUnavailableException(`Ошибка провайдера: HTTP ${response.status}`);
    }
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}
