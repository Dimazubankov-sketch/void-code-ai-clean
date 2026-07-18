import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LLM_PROVIDER, LlmProvider } from './providers/llm-provider.interface';

// Лимиты тарифов — источник истины ЗДЕСЬ, на сервере.
const PLAN_LIMITS: Record<string, { daily: number; weekly: number }> = {
  FREE: { daily: 10, weekly: 70 },
  PLUS: { daily: 200, weekly: 1400 },
  PRO: { daily: 1000, weekly: 7000 },
  ULTRA: { daily: Number.MAX_SAFE_INTEGER, weekly: Number.MAX_SAFE_INTEGER },
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

  async sendMessage(userId: string, chatId: string, content: string, model: string) {
    await this.consumeLimit(userId); // сначала проверяем и списываем лимит

    const chat = await this.prisma.chatSession.findFirstOrThrow({
      where: { id: chatId, userId }, // чужой чат прочитать нельзя
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });

    const answer = await this.llm.generate({
      model,
      systemPrompt: 'Ты — Void Code AI, ассистент разработчика. Отвечай на русском.',
      messages: [
        ...chat.messages.map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content },
      ],
    });

    const [, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { chatId, role: 'USER', content } }),
      this.prisma.message.create({ data: { chatId, role: 'ASSISTANT', content: answer, model } }),
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
