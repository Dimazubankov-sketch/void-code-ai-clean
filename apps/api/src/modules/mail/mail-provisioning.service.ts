import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ==========================================
// Провижининг адреса при регистрации (Resend)
// ==========================================
// С Resend это ПРОЩЕ, чем было с Migadu: Resend не хостит почтовые
// ящики — это API для отправки писем от имени любого адреса на
// верифицированном домене. Значит "создавать ящик" не нужно вообще,
// никакого внешнего вызова API. Логин пользователя уже имеет вид
// username@voidops.ru (домен зафиксирован на фронтенде, см.
// shared/lib/accounts.jsx: DOMAIN = '@voidops.ru') — просто сохраняем
// этот же адрес в User.mailboxAddress, чтобы им можно было пользоваться
// как "from"-адресом для писем и показывать в интерфейсе почты.
@Injectable()
export class MailProvisioningService {
  private readonly logger = new Logger(MailProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async provisionForUser(userId: string, email: string, _displayName?: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mailboxAddress: email },
      });
      this.logger.log(`Адрес ${email} закреплён за пользователем ${userId}`);
    } catch (e: any) {
      // Не блокируем регистрацию из-за сбоя записи адреса — учётка Void
      // Code AI и почтовая идентичность логически независимы.
      this.logger.error(`Не удалось закрепить почтовый адрес за ${userId}: ${e?.message || e}`);
    }
  }
}
