import { Injectable, Logger } from '@nestjs/common';

// ==========================================
// Migadu Admin API — провижининг почтовых ящиков
// ==========================================
// ВАЖНО про разграничение ключей (не перепутать при будущих правках):
//   • MIGADU_API_KEY (мастер-ключ) используется ТОЛЬКО здесь, ТОЛЬКО на
//     сервере, ТОЛЬКО для административных операций через
//     https://api.migadu.com/v1 (Basic Auth: admin-email + этот ключ) —
//     создание/удаление почтовых ЯЩИКОВ как сущностей у провайдера.
//   • Этот API НЕ умеет отправлять и НЕ умеет читать письма — это чисто
//     admin-панель провайдера в виде REST, а не почтовый протокол.
//     Отправка/чтение реальных писем идёт по SMTP/IMAP (см. mail.service.ts)
//     от имени пароля САМОГО ящика (генерируется при создании, хранится
//     зашифрованным в User.mailboxPasswordEnc) — мастер-ключ там не участвует
//     и никогда не должен туда попадать.
// Официальный формат подтверждён по документации Migadu API v1 и
// официальным SDK (migadu-go, migadu-cli, migadu-mcp): базовый URL
// https://api.migadu.com/v1, Basic Auth (email администратора аккаунта +
// API-ключ), создание ящика — POST /domains/{domain}/mailboxes.

@Injectable()
export class MigaduAdminService {
  private readonly logger = new Logger(MigaduAdminService.name);
  private readonly apiUrl = 'https://api.migadu.com/v1';

  private authHeader(): string {
    const adminEmail = process.env.MIGADU_ADMIN_EMAIL;
    const apiKey = process.env.MIGADU_API_KEY;
    if (!adminEmail || !apiKey) {
      throw new Error('MIGADU_ADMIN_EMAIL / MIGADU_API_KEY не заданы в .env сервера');
    }
    return 'Basic ' + Buffer.from(`${adminEmail}:${apiKey}`).toString('base64');
  }

  // Локальная часть адреса из email/имени: только латиница, цифры, точки
  // и дефисы, начинается с буквы. Если после очистки ничего не осталось
  // (например, email был целиком на кириллице) — используем "user" +
  // короткий случайный хвост, чтобы всё равно получить валидный адрес.
  sanitizeLocalPart(raw: string): string {
    const base = raw
      .toLowerCase()
      .split('@')[0]
      .replace(/[^a-z0-9.\-]/g, '')
      .replace(/^[.\-]+/, '')
      .slice(0, 32);
    return base.length >= 2 ? base : `user${Math.random().toString(36).slice(2, 8)}`;
  }

  // Создаёт ящик username@voidops.ru с указанным паролем. При конфликте
  // имени (уже занято) пробует добавить короткий числовой суффикс —
  // до 5 попыток, дальше сдаётся с понятной ошибкой.
  async createMailbox(localPart: string, password: string, displayName: string): Promise<string> {
    const domain = process.env.MIGADU_DOMAIN || 'voidops.ru';

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? localPart : `${localPart}${Math.floor(100 + Math.random() * 900)}`;
      const response = await fetch(`${this.apiUrl}/domains/${domain}/mailboxes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
        },
        body: JSON.stringify({
          local_part: candidate,
          name: displayName || candidate,
          password,
        }),
      });

      if (response.ok) {
        this.logger.log(`Ящик ${candidate}@${domain} создан`);
        return `${candidate}@${domain}`;
      }

      const body = await response.text().catch(() => '');
      const isConflict = response.status === 422 && /taken|exist|already/i.test(body);
      if (isConflict && attempt < 4) {
        this.logger.warn(`Локальная часть "${candidate}" занята, пробую другую…`);
        continue;
      }

      this.logger.error(`Migadu createMailbox HTTP ${response.status}: ${body.slice(0, 500)}`);
      throw new Error(`Не удалось создать почтовый ящик (HTTP ${response.status})`);
    }

    throw new Error('Не удалось подобрать свободное имя для почтового ящика');
  }
}
