import { Injectable, Logger } from '@nestjs/common';

// ==========================================
// Провижининг персонального ящика при регистрации
// ==========================================
// Провайдер сменился с Migadu на Mailgun — вся Migadu-специфичная логика
// (создание ящика через admin API, SMTP/IMAP-хосты Migadu) удалена
// вместе с migadu-admin.service.ts. Новая почта @voidops.ru будет
// исключительно внутренней для экосистемы (без внешней доставки третьим
// сторонам) — реализация на Mailgun будет добавлена отдельным раундом.
// Пока это заглушка: регистрация проходит как обычно, просто без
// автосоздания ящика (User.mailboxAddress остаётся null).
@Injectable()
export class MailProvisioningService {
  private readonly logger = new Logger(MailProvisioningService.name);

  async provisionForUser(userId: string, email: string, displayName?: string): Promise<void> {
    this.logger.log(`Провижининг почты для ${userId} пропущен — идёт миграция провайдера (Migadu -> Mailgun)`);
  }
}
