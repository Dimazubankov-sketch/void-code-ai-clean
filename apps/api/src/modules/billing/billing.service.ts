import { BadRequestException, Injectable, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Plan, BillingCycle, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TTS_DAILY_LIMITS, todayDayKey } from '../tts/tts.constants';

// Единая сетка тарифов (в копейках). Названия и id согласованы -
// больше никакой путаницы pro_plus/Ultra.
export const PRICING: Record<Plan, { month: number; year: number }> = {
  FREE: { month: 0, year: 0 },
  PLUS: { month: 350_00, year: 3500_00 },
  PRO: { month: 1000_00, year: 12000_00 },
  ULTRA: { month: 10000_00, year: 100000_00 },
};

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // ЮKassa — приём платежей (без заглушек)
  // ==========================================
  // Поток: createPayment создаёт платёж у ЮKassa и возвращает
  // confirmation_url (страница оплаты). Пользователь платит там; карту наш
  // сервер НЕ видит и НЕ хранит (PCI DSS на стороне ЮKassa). Активация
  // подписки происходит ТОЛЬКО после подтверждения статуса succeeded -
  // либо по вебхуку (handleWebhook), либо по опросу статуса фронтом
  // (getPaymentStatus). Оба пути повторно запрашивают статус у ЮKassa
  // (телу вебхука не доверяем) и активируют идемпотентно по externalPaymentId.

  private yooAuth(): string {
    const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
    const secret = process.env.YOOKASSA_SECRET_KEY?.trim();
    if (!shopId || !secret) {
      throw new ServiceUnavailableException(
        'Приём платежей не настроен. Задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в .env на сервере.',
      );
    }
    return 'Basic ' + Buffer.from(`${shopId}:${secret}`).toString('base64');
  }

  // Создать платёж и вернуть ссылку на оплату.
  async createPayment(userId: string, plan: Plan, cycle: BillingCycle) {
    if (plan === 'FREE') throw new BadRequestException('Тариф Free не требует оплаты');
    const auth = this.yooAuth();
    const priceKopecks = cycle === 'MONTH' ? PRICING[plan].month : PRICING[plan].year;
    const value = (priceKopecks / 100).toFixed(2);
    const base = (process.env.APP_URL || 'https://void-code.ru').replace(/\/$/, '');
    const returnUrl = `${base}/?payment=return`;

    let res: Response;
    try {
      res = await fetch(`${YOOKASSA_API}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotence-Key': randomUUID(),
          Authorization: auth,
        },
        body: JSON.stringify({
          amount: { value, currency: 'RUB' },
          capture: true,
          confirmation: { type: 'redirect', return_url: returnUrl },
          description: `Подписка ${plan} (${cycle === 'MONTH' ? 'месяц' : 'год'})`,
          metadata: { userId, plan, cycle, kind: 'subscription' },
        }),
      });
    } catch (e: any) {
      throw new ServiceUnavailableException(`Не удалось связаться с ЮKassa: ${e?.message || e}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error('[YooKassa/create] HTTP', res.status, body.slice(0, 500));
      if (res.status === 401) throw new ServiceUnavailableException('ЮKassa: неверный shopId или секретный ключ');
      throw new ServiceUnavailableException(`ЮKassa отклонила создание платежа (HTTP ${res.status})`);
    }
    const data: any = await res.json();
    return {
      paymentId: data.id as string,
      confirmationUrl: data.confirmation?.confirmation_url as string,
      status: data.status as string,
    };
  }

  // Опрос статуса платежа фронтом (после возврата с оплаты). Если оплачен -
  // активируем подписку и возвращаем новый план.
  async getPaymentStatus(paymentId: string, userId: string) {
    const auth = this.yooAuth();
    let res: Response;
    try {
      res = await fetch(`${YOOKASSA_API}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: auth },
      });
    } catch (e: any) {
      throw new ServiceUnavailableException(`Не удалось получить статус платежа: ${e?.message || e}`);
    }
    if (res.status === 404) throw new NotFoundException('Платёж не найден');
    if (!res.ok) throw new ServiceUnavailableException(`ЮKassa: ошибка статуса (HTTP ${res.status})`);
    const data: any = await res.json();
    const meta = data.metadata || {};
    if (data.status === 'succeeded') {
      // Проверяем, что платёж принадлежит этому пользователю (или доверяем
      // метаданным платежа, если запрос пришёл из вебхука без userId).
      if (userId && meta.userId && meta.userId !== userId) {
        throw new BadRequestException('Платёж принадлежит другому аккаунту');
      }
      await this.activate(paymentId, meta.userId || userId, meta.plan, meta.cycle);
      return { status: 'succeeded', plan: meta.plan as Plan };
    }
    return { status: data.status as string };
  }

  // Вебхук ЮKassa. Телу не доверяем — берём id и ПЕРЕЗАПРАШИВАЕМ статус у
  // API (getPaymentStatus), поэтому подделать активацию нельзя.
  async handleWebhook(body: any) {
    const event = body?.event;
    const id = body?.object?.id;
    if (event === 'payment.succeeded' && id) {
      try { await this.getPaymentStatus(id, ''); } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('[YooKassa/webhook] активация не удалась:', e?.message || e);
      }
    }
    return { ok: true };
  }

  // Идемпотентная активация подписки по подтверждённому платежу.
  private async activate(paymentId: string, userId?: string, plan?: Plan, cycle?: BillingCycle) {
    if (!userId || !plan || !cycle || plan === 'FREE') return null;
    // Уже активировали этот платёж? Ничего не делаем (защита от повторов
    // вебхук + опрос одновременно).
    const already = await this.prisma.subscription.findFirst({ where: { externalPaymentId: paymentId } });
    if (already) return already;

    const priceKopecks = cycle === 'MONTH' ? PRICING[plan].month : PRICING[plan].year;
    const endsAt = new Date();
    if (cycle === 'MONTH') endsAt.setMonth(endsAt.getMonth() + 1);
    else endsAt.setFullYear(endsAt.getFullYear() + 1);

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: { userId, plan, cycle, priceKopecks, endsAt, externalPaymentId: paymentId },
      });
      await tx.user.update({ where: { id: userId }, data: { plan } });

      // При апгрейде «доливаем» новый дневной лимит озвучки поверх уже
      // потраченного за сегодня (см. подробный комментарий истории).
      const dayKey = todayDayKey();
      const newLimit = TTS_DAILY_LIMITS[plan] ?? TTS_DAILY_LIMITS.FREE;
      const counter = await tx.usageCounter.findUnique({ where: { userId_dayKey: { userId, dayKey } } });
      if (counter) {
        const used = (counter as any).ttsCharsUsed ?? 0;
        if (used > 0) {
          await tx.usageCounter.update({ where: { id: counter.id }, data: { ttsCharsUsed: Math.max(0, used - newLimit) } as any });
        }
      }

      await tx.walletTransaction.create({
        data: {
          userId,
          type: TransactionType.SUBSCRIPTION,
          amountKopecks: -priceKopecks,
          description: `Подписка ${plan} (${cycle === 'MONTH' ? 'месяц' : 'год'})`,
        },
      });
      return sub;
    });
  }

  async getWallet(userId: string) {
    const [user, transactions] = await this.prisma.$transaction([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { walletKopecks: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { balanceKopecks: user.walletKopecks, transactions };
  }
}
