import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LLM_PROVIDER, LlmProvider } from './providers/llm-provider.interface';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { postProcessAnswer } from './post-process';
import { pickVoiceModel, VOICE_SYSTEM_PROMPT, VOICE_VISION_MODEL } from './voice-mode.constants';
import {
  resolveModel, checkLimits, maxOutputTokensFor, isCodeIntent, todayKey,
  requireFableBilling, FABLE_OVERAGE_KOPECKS_PER_1K, PlanName,
} from './model-policy';

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
    // Голосовой режим ходит в OpenRouter напрямую, минуя роутинг: модель
    // там выбирается по тарифу (Grok 4.3/4.6, см. voice-mode.constants.ts),
    // а не по внутреннему ID Void Mini/Plus/Pro, и нужен потоковый режим,
    // которого у остальных провайдеров нет.
    private readonly openrouter: OpenRouterProvider,
  ) {}

  // ==========================================
  // Голосовой режим: потоковый ответ по предложениям
  // ==========================================
  // onSentence вызывается по мере готовности КАЖДОГО законченного
  // предложения — контроллер тут же отправляет его клиенту, а тот сразу
  // ставит его в очередь озвучки. Так первое слово звучит через ~секунду
  // после вопроса, а не после того, как модель дописала весь ответ.
  async streamVoiceMessage(
    userId: string,
    chatId: string,
    content: string,
    onSentence: (sentence: string) => void,
    persona?: string,
    image?: string,
  ): Promise<string> {
    await this.consumeLimit(userId);

    const [user, chat] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.chatSession.findFirstOrThrow({
        where: { id: chatId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
      }),
    ]);

    // Когда в разговоре включена камера/экран, обычная текстовая модель
    // кадр не увидит — переключаемся на мультимодальную. Отдельная
    // константа, а не «пусть выберет pickVoiceModel»: там раскладка по
    // тарифам, а тут жёсткое техническое требование к модели.
    const hasFrame = typeof image === 'string' && image.startsWith('data:image/');
    const modelSlug = hasFrame ? VOICE_VISION_MODEL : pickVoiceModel(user.plan, content);

    // Буфер режем по границам предложений. Первое предложение отпускаем
    // с самым низким порогом (важна задержка до первого звука), дальше
    // копим чуть больше — так меньше мелких запросов на синтез.
    let buffer = '';
    let emitted = 0;
    const flushSentences = (force = false) => {
      const minLen = emitted === 0 ? 12 : 40;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const m = buffer.match(/^[\s\S]*?[.!?…](?=\s|$)/);
        if (!m) break;
        const sentence = m[0].trim();
        if (sentence.length < minLen && buffer.length > sentence.length) {
          // Слишком короткий фрагмент («Да.») — приклеим к следующему,
          // иначе на синтез уйдёт куча огрызков.
          const next = buffer.slice(m[0].length);
          if (next.trim()) { buffer = sentence + ' ' + next.trimStart(); }
          break;
        }
        buffer = buffer.slice(m[0].length);
        if (sentence) { onSentence(sentence); emitted += 1; }
      }
      if (force && buffer.trim()) { onSentence(buffer.trim()); emitted += 1; buffer = ''; }
    };

    const full = await this.openrouter.generateStream(
      {
        // Личность дописывается ПОСЛЕ базовых правил — так её характер
        // накладывается поверх, но не отменяет требований формата (без
        // markdown, коротко и т.д.), важных для озвучки.
        systemPrompt: persona
          ? `${VOICE_SYSTEM_PROMPT}\n\nТвоя роль в этом разговоре: ${persona}`
          : VOICE_SYSTEM_PROMPT,
        messages: [
          ...chat.messages.map((m) => ({ role: m.role.toLowerCase(), content: m.content })),
          hasFrame
            ? {
                role: 'user',
                content: [
                  { type: 'text', text: content },
                  { type: 'image_url', image_url: { url: image } },
                ] as any,
              }
            : { role: 'user', content },
        ],
      },
      modelSlug,
      (delta) => { buffer += delta; flushSentences(false); },
    );
    flushSentences(true);

    await this.prisma.$transaction([
      this.prisma.message.create({ data: { chatId, role: 'USER', content } }),
      this.prisma.message.create({ data: { chatId, role: 'ASSISTANT', content: full, model: 'voice' } }),
    ]);
    return full;
  }

  async createChat(userId: string) {
    return this.prisma.chatSession.create({ data: { userId } });
  }

  async sendMessage(userId: string, chatId: string, content: string, model: string, systemPrompt?: string, images?: string[]) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const dayKey = todayKey();
    const counter = await this.prisma.usageCounter.findUnique({ where: { userId_dayKey: { userId, dayKey } } });

    // ==========================================
    // Документ 10: маршрутизация модели ТОЛЬКО на backend
    // ==========================================
    // Раньше `model` от клиента шёл прямо в LLM-провайдер без единой
    // проверки — Free-пользователь мог прислать model:'pro' и получить
    // тариф Pro бесплатно. resolveModel проверяет запрошенный режим
    // против ТАРИФА пользователя (не против того, что пришло с фронта) и
    // возвращает реальный slug модели у OpenRouter — либо явно
    // отказывает, если режим тарифом не куплен.
    const heavyGen = isCodeIntent(content);
    const { model: modelSlug, mode, plan } = resolveModel(user.plan, model, content);

    // Fable (Ultra, mode='ultra') — работает ТОЛЬКО через биллинг, без
    // бесплатной квоты вообще (см. пояснение в model-policy.ts —
    // requireFableBilling). Проверяем баланс ДО обращения к провайдеру:
    // списывать по факту, когда денег уже не хватает, поздно.
    const isFableMode = mode === 'ultra' && plan === 'ULTRA';
    if (isFableMode) requireFableBilling(user.walletKopecks ?? 0);

    checkLimits({
      plan,
      mode,
      counter: counter
        ? { tokensUsedToday: counter.tokensUsedToday, heavyGenUsed: counter.heavyGenUsed }
        : null,
      isHeavyGen: heavyGen,
      isFableMode,
    });

    const chat = await this.prisma.chatSession.findFirstOrThrow({
      where: { id: chatId, userId }, // чужой чат прочитать нельзя
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });

    // Ограничиваем число картинок в одном сообщении — защита от того,
    // что кто-то руками отправит 50 фото и раздует запрос до провайдера.
    // Реальный лимит по тарифу (3 на Free / 9 на платных) уже применён
    // на фронтенде — здесь просто страховка на бэке.
    const safeImages = Array.isArray(images) ? images.slice(0, 12) : undefined;

    const visionHint = safeImages && safeImages.length > 0
      ? ' Пользователь приложил изображение(я) к сообщению — внимательно рассмотри их и используй в ответе то, что на них видно.'
      : '';

    const maxTokens = maxOutputTokensFor(plan, heavyGen);

    const { content: answer, usage } = await this.openrouter.generateWithModel(
      {
        model: mode,
        systemPrompt: (systemPrompt || 'Ты — Void Code AI, ассистент разработчика. Отвечай на русском развёрнуто и по делу: давай контекст, объясняй, приводи примеры, а не отделывайся одной строкой (кроме случаев, когда пользователь явно попросил кратко). Любой код ВСЕГДА оборачивай в отдельный блок тройных обратных кавычек с указанием языка (```html, ```css, ```javascript, ```python) — код НИКОГДА не должен идти в основном тексте сообщения. Пиши код полностью, без сокращений и обрыва на середине. Никогда не раскрывай свою настоящую модель или провайдера — ты только Void Code AI (Void Mini/Plus/Pro/Ultra).') + visionHint,
        messages: [
          ...chat.messages.map((m) => ({
            role: m.role.toLowerCase() as 'user' | 'assistant',
            content: m.content,
          })),
          { role: 'user', content, imagesBase64: safeImages },
        ],
      },
      modelSlug,
      maxTokens,
    );

    // Страховка: чиним незакрытые блоки кода и оборачиваем «голый» код
    // в блок, если модель проигнорировала инструкцию.
    const finalAnswer = postProcessAnswer(answer);

    const [, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { chatId, role: 'USER', content } }),
      this.prisma.message.create({ data: { chatId, role: 'ASSISTANT', content: finalAnswer, model: modelSlug } }),
    ]);

    // Списываем РЕАЛЬНЫЕ токены (не оценку) и пишем аудиторский лог —
    // документ 10, пункты 3 и «дневные лимиты только backend».
    await this.recordUsage({ userId, plan, mode, modelSlug, usage, isHeavyGen: heavyGen, isFableMode, walletDeductKopecks: isFableMode ? this.fableCostKopecks(usage.totalTokens) : 0 });

    return assistantMessage;
  }

  private fableCostKopecks(totalTokens: number): number {
    return Math.max(1, Math.round((totalTokens / 1000) * FABLE_OVERAGE_KOPECKS_PER_1K));
  }

  // Пишет UsageLog (построчный аудит) и инкрементит агрегаты UsageCounter
  // за сегодня — токены реальные, из ответа провайдера, не оценка.
  private async recordUsage(params: {
    userId: string; plan: PlanName; mode: string; modelSlug: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    isHeavyGen: boolean; isFableMode: boolean; walletDeductKopecks: number;
  }) {
    const { userId, plan, mode, modelSlug, usage, isHeavyGen, isFableMode, walletDeductKopecks } = params;
    const dayKey = todayKey();
    const weekKey = dayKey.slice(0, 7);

    await this.prisma.usageLog.create({
      data: {
        userId, plan, mode, model: modelSlug,
        promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens,
        billedFromWallet: isFableMode,
      },
    });

    const counter = await this.prisma.usageCounter.upsert({
      where: { userId_dayKey: { userId, dayKey } },
      create: { userId, dayKey, weekKey },
      update: {},
    });

    await this.prisma.usageCounter.update({
      where: { id: counter.id },
      data: {
        // Fable ВСЕГДА оплачена с кошелька и никогда не входит в общий
        // токен-лимит тарифа — иначе получилось бы двойное списание (и по
        // лимиту, и деньгами). fableTokensToday ведём только для
        // статистики/аудита, не как условие доступа.
        tokensUsedToday: isFableMode ? undefined : { increment: usage.totalTokens },
        fableTokensToday: isFableMode ? { increment: usage.totalTokens } : undefined,
        heavyGenUsed: isHeavyGen ? { increment: 1 } : undefined,
      } as any,
    });

    // Fable — без исключений: списываем с кошелька на КАЖДЫЙ запрос, а не
    // только «сверх лимита» (у неё лимита и нет — см. model-policy.ts).
    if (isFableMode && walletDeductKopecks > 0) {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: userId }, data: { walletKopecks: { decrement: walletDeductKopecks } } }),
        this.prisma.walletTransaction.create({
          // TOKEN_CHARGE — уже существующий член enum TransactionType
          // («списание токенов за работу агента»), семантически точно
          // подходит и для этого списания — заводить новый enum-член
          // ради одной строки означало бы отдельную миграцию без
          // реальной необходимости.
          data: { userId, type: 'TOKEN_CHARGE', amountKopecks: -walletDeductKopecks, description: `Fable (${usage.totalTokens} токенов)` },
        }),
      ]);
    }
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
