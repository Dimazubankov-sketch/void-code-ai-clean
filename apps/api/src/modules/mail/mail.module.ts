import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';
import { MigaduAdminService } from './migadu-admin.service';
import { MailProvisioningService } from './mail-provisioning.service';

@Module({
  imports: [PrismaModule],
  controllers: [MailController],
  providers: [MailService, MigaduAdminService, MailProvisioningService],
  // MailProvisioningService экспортируется отдельно — его вызывает
  // AuthService при регистрации (создание ящика сразу после создания
  // пользователя), поэтому AuthModule должен суметь его импортировать.
  exports: [MailProvisioningService],
})
export class MailModule {}
