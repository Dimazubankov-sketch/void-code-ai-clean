import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// ==========================================
// MailService — временная заглушка на время миграции Migadu -> Mailgun
// ==========================================
// Реальная SMTP/IMAP-интеграция с Migadu удалена целиком (по требованию:
// «удалить всю информацию о Migadu»). Новая почта @voidops.ru будет
// исключительно внутренней для экосистемы Void Code AI (без возможности
// использовать её для регистрации на сторонних сайтах) и будет работать
// через Mailgun — реализация добавится отдельным раундом.
//
// Пока что все методы явно отвечают «почта временно недоступна», чтобы
// фронтенд (NotificationCenter.jsx) показывал понятный статус вместо
// падения с непонятной ошибкой.

export interface MailboxCredentials {
  address: string;
  password: string;
}

export interface InboxMessageSummary {
  uid: number;
  subject: string;
  from: string;
  at: string;
  preview: string;
  unread: boolean;
}

export interface FullMessage extends InboxMessageSummary {
  body: string;
  html?: string;
}

const MIGRATION_MESSAGE = 'Почта временно недоступна — идёт переход на нового провайдера. Попробуйте позже.';

@Injectable()
export class MailService {
  async sendMail(_creds: MailboxCredentials, _to: string, _subject: string, _text: string): Promise<void> {
    throw new ServiceUnavailableException(MIGRATION_MESSAGE);
  }

  async listInbox(_creds: MailboxCredentials, _limit = 30): Promise<InboxMessageSummary[]> {
    throw new ServiceUnavailableException(MIGRATION_MESSAGE);
  }

  async getMessage(_creds: MailboxCredentials, _uid: number): Promise<FullMessage | null> {
    throw new ServiceUnavailableException(MIGRATION_MESSAGE);
  }
}
