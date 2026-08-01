import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmProvider, LlmRequest } from './llm-provider.interface';

// Адаптер Groq (OpenAI-совместимый чат-эндпоинт). Ключ живёт ТОЛЬКО в
// переменных окружения сервера — браузер пользователя его никогда не видит.
@Injectable()
export class GroqProvider implements LlmProvider {
  readonly name = 'groq';

  private readonly apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  // Внутренние ID моделей на фронтенде (flash/flash_ext/pro — для UI и
  // тарифных лимитов) — это НЕ настоящие имена моделей Groq. Мапим их сюда,
  // а не доверяем строке от клиента напрямую (иначе Groq вернёт 404 на
  // несуществующую модель "pro").
  // Примечание: Groq анонсировал будущий вывод llama-3.3-70b-versatile из
  // эксплуатации (без точной даты) — когда это случится, замени здесь на
  // актуальную модель из https://console.groq.com/docs/models.
  private readonly modelMap: Record<string, string> = {
    flash: 'llama-3.3-70b-versatile',
    flash_ext: 'llama-3.3-70b-versatile',
    pro: 'llama-3.3-70b-versatile',
  };

  async generate(req: LlmRequest): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('LLM-провайдер не сконфигурирован');

    // Groq использует OpenAI-совместимый формат: system-промпт — это
    // обычное сообщение с role: 'system' в начале массива messages.
    const messages = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelMap[req.model] || 'llama-3.3-70b-versatile',
        messages,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Ошибка провайдера: HTTP ${response.status}`);
    }
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}
