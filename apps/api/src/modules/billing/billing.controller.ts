import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

  @Post('subscribe')
  subscribe(@Req() req: any, @Body() dto: SubscribeDto) {
    return this.billing.createSubscription(req.user.userId, dto.plan, dto.cycle);
  }

  @Get('wallet')
  wallet(@Req() req: any) {
    return this.billing.getWallet(req.user.userId);
  }
}
