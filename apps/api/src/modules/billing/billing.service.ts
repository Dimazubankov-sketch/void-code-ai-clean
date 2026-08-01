import { BadRequestException, Injectable } from '@nestjs/common';
import { Plan, BillingCycle, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Единая сетка тарифов (в копейках). Названия и id согласованы —
// больше никакой путаницы pro_plus/Ultra.
export const PRICING: Record<Plan, { month: number; year: number }> = {
  FREE: { month: 0, year: 0 },
  PLUS: { month: 350_00, year: 3500_00 },
  PRO: { month: 1000_00, year: 12000_00 },
  ULTRA: { month: 10000_00, year: 100000_00 },
};

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ВАЖНО: это заглушка под интеграцию ЮKassa/CloudPayments.
  // Реальный поток: создаём платёж у провайдера → пользователь платит на их
  // странице/виджете → провайдер шлёт вебхук → мы активируем подписку.
  // Сырые данные карт наш сервер НЕ принимает и НЕ хранит (PCI DSS).
  async createSubscription(userId: string, plan: Plan, cycle: BillingCycle) {
    if (plan === 'FREE') throw new BadRequestException('Тариф Free не требует оплаты');

    const priceKopecks = cycle === 'MONTH' ? PRICING[plan].month : PRICING[plan].year;
    const endsAt = new Date();
    if (cycle === 'MONTH') endsAt.setMonth(endsAt.getMonth() + 1);
    else endsAt.setFullYear(endsAt.getFullYear() + 1);

    // Подписка + смена тарифа + запись в историю — одной транзакцией
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: { userId, plan, cycle, priceKopecks, endsAt },
      });
      await tx.user.update({ where: { id: userId }, data: { plan } });
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
