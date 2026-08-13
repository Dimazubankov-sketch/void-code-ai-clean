import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';

// ==========================================
// MailService — отправка почты через Resend
// ==========================================
// Resend — API для ОТПРАВКИ писем (транзакционные письма), у него нет
// понятия "почтовый ящик" и нет способа читать входящие (нет IMAP/POP3
// аналога) — в отличие от Migadu, здесь не нужно ничего "создавать" для
// пользователя при регистрации: один общий RESEND_API_KEY отправляет
// письма от имени любого адреса на ВЕРИФИЦИРОВАННОМ в Resend домене.
// Этим пользуемся: каждый пользователь отправляет письма от СВОЕГО
// личного адреса (username@voidops.ru, см. mail.controller.ts), а не с
// одного общего noreply@ — Resend это разрешает без каких-либо
// дополнительных действий, т.к. верификация в Resend идёт на уровне
// домена целиком, а не отдельных адресов.
//
// ВАЖНО (нужно сделать один раз в панели Resend, иначе отправка будет
// падать): домен voidops.ru должен быть добавлен и верифицирован в
// resend.com/domains (SPF/DKIM DNS-записи) — без этого Resend отклонит
// письма с адресов вида ...@voidops.ru.

// Простое и безопасное превращение обычного текста в HTML: экранируем
// спецсимволы (защита от HTML-инъекции через тему/текст письма) и
// заменяем переносы строк на <br>, чтобы форматирование совпадало с тем,
// что человек видел в поле «Текст письма».
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return `<div style="font-family: sans-serif; font-size: 15px; white-space: pre-wrap;">${escapeHtml(text)}</div>`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY не задан в .env — отправка писем недоступна');
    }
  }

  // fromAddress — личный адрес отправителя (username@voidops.ru), берётся
  // контроллером из авторизованного пользователя (req.user), а не задаётся
  // здесь константой. fromName — отображаемое имя ("Иван" <ivan@voidops.ru>),
  // необязательно.
  // html/text опциональны — если вызывающая сторона прислала только
  // обычный текст (как сейчас делает фронтенд, см. mail.controller.ts),
  // html генерируется автоматически из text.
  async sendEmail(
    to: string,
    subject: string,
    fromAddress: string,
    fromName?: string,
    html?: string,
    text?: string,
  ): Promise<{ id: string | null }> {
    if (!this.resend) {
      throw new ServiceUnavailableException('Почта не настроена на сервере — отсутствует RESEND_API_KEY');
    }
    if (!fromAddress) {
      throw new ServiceUnavailableException('Не удалось определить адрес отправителя');
    }
    if (!html && !text) {
      throw new ServiceUnavailableException('Пустое письмо — нужен текст или HTML');
    }

    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to,
        subject,
        html: html || textToHtml(text as string),
        text: text || undefined,
      });

      if (error) {
        // Самая частая причина ошибки на старте — домен voidops.ru ещё не
        // верифицирован в Resend (см. комментарий выше класса). Resend
        // возвращает это как объект `error`, а не бросает исключение.
        this.logger.error(`Resend отклонил письмо to=${to}: ${JSON.stringify(error)}`);
        throw new ServiceUnavailableException('Не удалось отправить письмо — почтовый сервис отклонил запрос');
      }

      this.logger.log(`Письмо отправлено через Resend: id=${data?.id}, from=${fromAddress}, to=${to}`);
      return { id: data?.id ?? null };
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`Resend sendEmail упал: ${e?.message || e}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо — почтовый сервис недоступен');
    }
  }

  // Payload вебхука email.received содержит ТОЛЬКО метаданные (from/to/
  // subject/attachments) — само тело письма (html/text) в нём нет, его
  // нужно отдельно запросить по email_id через GET /emails/receiving/{id}
  // (см. resend.com/docs — "Payload contains metadata only, not email
  // body or attachment content"). Возвращает null, если запрос не удался
  // или Resend не настроен — вызывающая сторона (webhook-контроллер)
  // сохранит письмо без текста, а не упадёт целиком.
  async getReceivedEmail(emailId: string): Promise<{ html: string | null; text: string | null } | null> {
    if (!this.resend) return null;
    try {
      const { data, error } = await this.resend.emails.receiving.get(emailId);
      if (error) {
        this.logger.error(`Resend отклонил запрос тела входящего письма id=${emailId}: ${JSON.stringify(error)}`);
        return null;
      }
      return { html: data?.html ?? null, text: data?.text ?? null };
    } catch (e: any) {
      this.logger.error(`Не удалось получить тело входящего письма id=${emailId}: ${e?.message || e}`);
      return null;
    }
  }
}
