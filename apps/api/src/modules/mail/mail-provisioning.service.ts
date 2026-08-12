import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MigaduAdminService } from './migadu-admin.service';
import { encryptSecret, generateMailboxPassword } from '../../common/crypto/encryption.util';

// ==========================================
// Провижининг персонального ящика при регистрации (задача 1)
// ==========================================
// Вызывается из AuthService.register() ПОСЛЕ того, как пользователь уже
// успешно создан в БД. Намеренно не блокирует и не откатывает саму
// регистрацию, если создание ящика не удалось (например, Migadu временно
// недоступен) — учётка Void Code AI и почта на voidops.ru логически
// независимы: пользователь должен суметь зайти и пользоваться чатом/агентами
// даже если провайдер почты в этот момент недоступен. Вместо этого просто
// логируем ошибку — mailboxAddress остаётся null, фронтенд аккуратно
// показывает «почта ещё не создана» во вкладке почты вместо падения.
@Injectable()
export class MailProvisioningService {
  private readonly logger = new Logger(MailProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly migadu: MigaduAdminService,
  ) {}

  async provisionForUser(userId: string, email: string, displayName?: string): Promise<void> {
    try {
      const localPart = this.migadu.sanitizeLocalPart(email);
      const mailboxPassword = generateMailboxPassword();
      const mailboxAddress = await this.migadu.createMailbox(localPart, mailboxPassword, displayName || localPart);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mailboxAddress,
          mailboxPasswordEnc: encryptSecret(mailboxPassword),
        },
      });
      this.logger.log(`Ящик ${mailboxAddress} привязан к пользователю ${userId}`);
    } catch (e: any) {
      this.logger.error(`Не удалось создать почтовый ящик для пользователя ${userId}: ${e?.message || e}`);
      // Намеренно не пробрасываем ошибку дальше — см. комментарий выше класса.
    }
  }
}
