import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailController } from './mail.controller';
import { MailWebhookController } from './mail-webhook.controller';
import { MailService } from './mail.service';
import { MailStoreService } from './mail-store.service';
import { MailProvisioningService } from './mail-provisioning.service';

@Module({
  imports: [PrismaModule],
  // MailWebhookController — без JwtAuthGuard (см. комментарий в файле),
  // принимает входящие письма напрямую от Resend.
  controllers: [MailController, MailWebhookController],
  providers: [MailService, MailStoreService, MailProvisioningService],
  exports: [MailProvisioningService],
})
export class MailModule {}
