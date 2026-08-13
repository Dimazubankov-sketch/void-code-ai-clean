import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { MailProvisioningService } from './mail-provisioning.service';

@Module({
  imports: [PrismaModule],
  controllers: [MailController],
  providers: [MailService, MailProvisioningService],
  exports: [MailProvisioningService],
})
export class MailModule {}
