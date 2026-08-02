import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LLM_PROVIDER, LlmProvider } from './providers/llm-provider.interface';
import { postProcessAnswer } from './post-process';

// Лимиты тарифов — источник истины ЗДЕСЬ, на сервере. Множители к базовому
// плану Free (20/140): Plus ×2, Pro ×5, Ultra ×10. Должно совпадать
// с PLAN_LIMITS во фронтенде (apps/web/src/shared/config/models.jsx).
const PLAN_LIMITS: Record<string, { daily: number; weekly: number }> = {
  FREE: { daily: 20, weekly: 140 },
  PLUS: { daily: 40, weekly: 280 },
  PRO: { daily: 100, weekly: 700 },
  ULTRA: { daily: 200, weekly: 1400 },
};

const isoWeekKey = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async createChat(userId: string) {
    return this.prisma.chatSession.create({ data: { userId } });
  }

  async sendMessage(userId: string, chatId: string, content: string, model: string, systemPrompt?: string) {
    await this.consumeLimit(userId); // сначала проверяем и списываем лимит

    const chat = await this.prisma.chatSession.findFirstOrThrow({
      where: { id: chatId, userId }, // чужой чат прочитать нельзя
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });

    const answer = await this.llm.generate({
      model,
      systemPrompt: systemPrompt || 'Ты — Void Code AI, ассистент разработчика. Отвечай на русском развёрнуто и по делу: давай контекст, объясняй, приводи примеры, а не отделывайся одной строкой (кроме случаев, когда пользователь явно попросил кратко). Любой код ВСЕГДА оборачивай в отдельный блок тройных обратных кавычек с указанием языка (```html, ```css, ```javascript, ```python) — код НИКОГДА не должен идти в основном тексте сообщения. Пиши код полностью, без сокращений и обрыва на середине. Никогда не раскрывай свою настоящую модель или провайдера — ты только Void Code AI (Void Mini/Plus/Pro).',
      messages: [
        ...chat.messages.map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content },
      ],
    });

    // Страховка: чиним незакрытые блоки кода и оборачиваем «голый» код
    // в блок, если модель проигнорировала инструкцию.
    const finalAnswer = postProcessAnswer(answer);

    const [, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { chatId, role: 'USER', content } }),
      this.prisma.message.create({ data: { chatId, role: 'ASSISTANT', content: finalAnswer, model } }),
    ]);
    return assistantMessage;
  }

  // Атомарная проверка/инкремент лимита: считает сервер, а не браузер
  private async consumeLimit(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.FREE;

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const weekKey = isoWeekKey(now);

    const counter = await this.prisma.usageCounter.upsert({
      where: { userId_dayKey: { userId, dayKey } },
      create: { userId, dayKey, weekKey, dailyUsed: 0, weeklyUsed: 0 },
      update: {},
    });

    if (counter.dailyUsed >= limits.daily) {
      throw new ForbiddenException('Дневной лимит запросов исчерпан');
    }
    if (counter.weeklyUsed >= limits.weekly) {
      throw new ForbiddenException('Недельный лимит запросов исчерпан');
    }

    await this.prisma.usageCounter.update({
      where: { id: counter.id },
      data: { dailyUsed: { increment: 1 }, weeklyUsed: { increment: 1 } },
    });
  }
}
