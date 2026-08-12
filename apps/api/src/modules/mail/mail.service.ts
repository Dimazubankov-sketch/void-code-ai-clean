import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// ==========================================
// MailService — реальная отправка (SMTP) и чтение (IMAP) писем
// ==========================================
// В отличие от MigaduAdminService (мастер-ключ, только провижининг
// ящиков), здесь мы каждый раз авторизуемся стандартным протоколом
// SMTP/IMAP как САМ почтовый ящик пользователя (его address + расшифрованный
// mailboxPasswordEnc). Это ровно то же самое, как если бы пользователь
// подключил Thunderbird/Outlook к своему @voidops.ru — просто это делает
// наш сервер от его имени. Мастер-ключ Migadu сюда не передаётся и не
// нужен: он не имеет отношения к SMTP/IMAP протоколу.
//
// Хосты подтверждены официальной документацией Migadu (одинаковые для
// всех доменов на Migadu, не зависят от voidops.ru): smtp.migadu.com:465
// (SSL) для отправки, imap.migadu.com:993 (TLS) для чтения.

export interface MailboxCredentials {
  address: string;
  password: string;
}

export interface InboxMessageSummary {
  uid: number;
  subject: string;
  from: string;
  at: string; // ISO
  preview: string;
  unread: boolean;
}

export interface FullMessage extends InboxMessageSummary {
  body: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private transporter(creds: MailboxCredentials) {
    return nodemailer.createTransport({
      host: 'smtp.migadu.com',
      port: 465,
      secure: true,
      auth: { user: creds.address, pass: creds.password },
    });
  }

  async sendMail(creds: MailboxCredentials, to: string, subject: string, text: string): Promise<void> {
    try {
      const transport = this.transporter(creds);
      await transport.sendMail({
        from: creds.address,
        to,
        subject,
        text,
      });
    } catch (e: any) {
      this.logger.error(`SMTP отправка не удалась для ${creds.address}: ${e?.message || e}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо — почтовый сервер недоступен или отклонил запрос');
    }
  }

  // Список писем во «Входящих» — только заголовки + короткий превью текста
  // (полное тело письма подтягивается отдельно, лениво, при открытии —
  // см. getMessage). limit ограничивает нагрузку на IMAP-сессию, самые
  // свежие письма первыми.
  async listInbox(creds: MailboxCredentials, limit = 30): Promise<InboxMessageSummary[]> {
    const client = new ImapFlow({
      host: 'imap.migadu.com',
      port: 993,
      secure: true,
      auth: { user: creds.address, pass: creds.password },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const status = await client.status('INBOX', { messages: true });
        const total = status.messages || 0;
        if (total === 0) return [];

        const from = Math.max(1, total - limit + 1);
        const results: InboxMessageSummary[] = [];
        for await (const msg of client.fetch(`${from}:${total}`, { envelope: true, flags: true, bodyStructure: true, source: false, uid: true })) {
          const fromAddr = msg.envelope?.from?.[0];
          const fromLabel = fromAddr ? (fromAddr.name ? `${fromAddr.name} <${fromAddr.address}>` : fromAddr.address) : 'Неизвестный отправитель';
          results.push({
            uid: msg.uid,
            subject: msg.envelope?.subject || '(без темы)',
            from: fromLabel || 'Неизвестный отправитель',
            at: (msg.envelope?.date || new Date()).toISOString(),
            preview: '', // короткий текст письма не тянем на этапе списка — дорого при большом инбоксе
            unread: !msg.flags?.has('\\Seen'),
          });
        }
        return results.reverse(); // свежие сверху
      } finally {
        lock.release();
      }
    } catch (e: any) {
      this.logger.error(`IMAP список писем не удался для ${creds.address}: ${e?.message || e}`);
      throw new ServiceUnavailableException('Не удалось получить входящие письма — почтовый сервер недоступен');
    } finally {
      await client.logout().catch(() => { /* соединение могло уже упасть */ });
    }
  }

  // Полное тело письма по uid — вызывается лениво при открытии письма
  // в интерфейсе, не при каждом обновлении списка.
  async getMessage(creds: MailboxCredentials, uid: number): Promise<FullMessage | null> {
    const client = new ImapFlow({
      host: 'imap.migadu.com',
      port: 993,
      secure: true,
      auth: { user: creds.address, pass: creds.password },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const raw = await client.download(String(uid), undefined, { uid: true });
        if (!raw) return null;
        const parsed = await simpleParser(raw.content);
        const fromAddr = parsed.from?.value?.[0];
        const fromLabel = fromAddr?.address
          ? (fromAddr.name ? `${fromAddr.name} <${fromAddr.address}>` : fromAddr.address)
          : 'Неизвестный отправитель';
        return {
          uid,
          subject: parsed.subject || '(без темы)',
          from: fromLabel,
          at: (parsed.date || new Date()).toISOString(),
          preview: (parsed.text || '').slice(0, 160),
          unread: false,
          body: parsed.text || '',
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
        };
      } finally {
        lock.release();
      }
    } catch (e: any) {
      this.logger.error(`IMAP чтение письма uid=${uid} не удалось для ${creds.address}: ${e?.message || e}`);
      throw new ServiceUnavailableException('Не удалось открыть письмо — почтовый сервер недоступен');
    } finally {
      await client.logout().catch(() => { /* noop */ });
    }
  }
}
