import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmProvider, LlmRequest } from './llm-provider.interface';

// Адаптер Google Gemini. Ключ живёт ТОЛЬКО в переменных окружения сервера —
// браузер пользователя его никогда не видит.
@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  async generate(req: LlmRequest): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('LLM-провайдер не сконфигурирован');

    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: m.content },
        ...(m.imageBase64
          ? [{ inlineData: { mimeType: 'image/jpeg', data: m.imageBase64 } }]
          : []),
      ],
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Ключ в заголовке, а не в query-строке: не оседает в логах прокси
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: req.systemPrompt }] },
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 2048,
            temperature: req.temperature ?? 0.7,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException(`Ошибка провайдера: HTTP ${response.status}`);
    }
    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
