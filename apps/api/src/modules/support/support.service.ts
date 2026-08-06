import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider } from '../chat/providers/llm-provider.interface';

// ==========================================
// SupportService — ИИ-техподдержка (чат «Сведения → Справочный центр»
// и «Помощь»)
// ==========================================
// Системный промпт задан ЖЁСТКО здесь, на сервере — клиент передаёт
// только текст сообщения и историю диалога, но не может подменить
// «личность» агента (в отличие от обычного чата, где systemPrompt
// приходит от фронтенда). Модель — всегда Void Mini (id 'flash' в
// внутреннем роутинге, см. RoutingLlmProvider): самая быстрая и лёгкая,
// этого достаточно для типовых вопросов техподдержки.
const SUPPORT_SYSTEM_PROMPT =
  'Ты — сотрудник техподдержки компании Void Code AI. Твоя задача — решать проблемы пользователей. ' +
  'Ты знаешь всю структуру приложения Void Code. Отвечай максимально коротко, сухо и по делу. ' +
  'Не используй много тире (—) и сложных форматирований. Не веди долгих бесед. ' +
  'Если проблему можно решить быстро — дай инструкцию. Если проблема не решается в рамках базовых советов, ' +
  'извинись, запроси почту пользователя (обязательно домен @voidops.ru), сообщи, что профильные эксперты ' +
  'решат проблему в течение 3-х рабочих дней, и попрощайся. После этого заверши диалог.';

export interface SupportHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class SupportService {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async reply(message: string, history: SupportHistoryMessage[], images?: string[]): Promise<string> {
    const safeImages = Array.isArray(images) ? images.slice(0, 4) : undefined;
    const visionHint = safeImages && safeImages.length > 0
      ? ' Пользователь приложил изображение(я) к сообщению — рассмотри их, если это скриншот ошибки или проблемы.'
      : '';

    return this.llm.generate({
      model: 'flash',
      systemPrompt: SUPPORT_SYSTEM_PROMPT + visionHint,
      // Короткая история — support-диалоги короткие по замыслу промпта,
      // 20 последних сообщений с большим запасом.
      messages: [
        ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: message, imagesBase64: safeImages },
      ],
      // Ответы техподдержки должны быть короткими по промпту — небольшой
      // maxTokens лишний раз это подкрепляет и держит стоимость низкой.
      maxTokens: 500,
    });
  }
}
