import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController, BillingWebhookController } from './billing.controller';

@Module({ providers: [BillingService], controllers: [BillingController, BillingWebhookController] })
export class BillingModule {}
