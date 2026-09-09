import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { Plan, BillingCycle } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

class SubscribeDto {
  @IsEnum(Plan)
  plan!: Plan;

  @IsEnum(BillingCycle)
  cycle!: BillingCycle;
}

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Создаёт платёж в ЮKassa, возвращает ссылку на оплату (confirmationUrl).
  @Post('subscribe')
  subscribe(@Req() req: any, @Body() dto: SubscribeDto) {
    return this.billing.createPayment(req.user.userId, dto.plan, dto.cycle);
  }

  // Опрос статуса платежа после возврата с оплаты (активирует подписку,
  // если платёж прошёл).
  @Get('payment/:id')
  paymentStatus(@Req() req: any, @Param('id') id: string) {
    return this.billing.getPaymentStatus(id, req.user.userId);
  }

  @Get('wallet')
  wallet(@Req() req: any) {
    return this.billing.getWallet(req.user.userId);
  }
}

// Вебхук ЮKassa — ПУБЛИЧНЫЙ (без JWT): ЮKassa шлёт уведомления сервер-к-серверу.
// Безопасность: тело не является доверенным, статус перепроверяется через
// API ЮKassa внутри сервиса (см. handleWebhook → getPaymentStatus).
@Controller('billing/yookassa')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  webhook(@Body() body: any) {
    return this.billing.handleWebhook(body);
  }
}
