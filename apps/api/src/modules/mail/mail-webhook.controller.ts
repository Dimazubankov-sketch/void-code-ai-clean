import { Controller, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Webhook } from 'svix';
import { MailStoreService } from './mail-store.service';

// ==========================================
// MailWebhookController — входящие письма от Resend
// ==========================================
// ВАЖНО: этот контроллер НАМЕРЕННО без @UseGuards(JwtAuthGuard) — его
// дёргает сервер Resend (POST-запрос по URL, который нужно один раз
// прописать в resend.com/webhooks), а не пользователь из браузера, у
// него нет и не может быть JWT-токена Void Code.
//
// Вместо JWT подлинность запроса проверяется подписью Resend (Resend
// подписывает вебхуки через Svix, см. verify() ниже) — без верной
// подписи и без RESEND_WEBHOOK_SECRET в .env запрос отклоняется, а не
// обрабатывается «доверчиво».
//
// НАСТРОЙКА (сделать один раз в панели Resend, иначе входящая почта не
// заработает):
//   1. resend.com/webhooks -> Add Endpoint
//   2. URL: https://<домен_сервера>/api/v1/mail/webhook/resend
//   3. Событие: email.received (или "Inbound" — как называется в
//      интерфейсе Resend на момент настройки)
//   4. Скопировать Signing Secret оттуда и положить в .env как
//      RESEND_WEBHOOK_SECRET=whsec_...
@Controller('mail/webhook')
export class MailWebhookController {
  private readonly logger = new Logger(MailWebhookController.name);

  constructor(private readonly store: MailStoreService) {}

  @Post('resend')
  @HttpCode(200)
  async resend(@Req() req: Request, @Res() res: Response) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      // Осознанно НЕ обрабатываем вебхук без секрета — иначе кто угодно,
      // узнав URL, мог бы "подкладывать" пользователям поддельные письма
      // прямо во «Входящие». Пока секрет не настроен, входящая почта
      // просто не работает (это видно в логах), а не работает "небезопасно".
      this.logger.error('RESEND_WEBHOOK_SECRET не задан в .env — входящий вебхук отклонён. См. комментарий в mail-webhook.controller.ts для настройки.');
      return res.status(503).json({ error: 'webhook not configured' });
    }

    // Подпись считается по СЫРОМУ телу запроса (до JSON.parse) — оно
    // сохраняется в req.rawBody глобальным middleware в main.ts.
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      this.logger.error('req.rawBody отсутствует — проверь настройку express.json({ verify }) в main.ts');
      return res.status(500).json({ error: 'server misconfigured' });
    }

    let payload: any;
    try {
      const wh = new Webhook(secret);
      payload = wh.verify(rawBody, {
        'svix-id': String(req.headers['svix-id'] || ''),
        'svix-timestamp': String(req.headers['svix-timestamp'] || ''),
        'svix-signature': String(req.headers['svix-signature'] || ''),
      });
    } catch (e: any) {
      this.logger.warn(`Подпись вебхука Resend не прошла проверку: ${e?.message || e}`);
      return res.status(401).json({ error: 'invalid signature' });
    }

    try {
      await this.handleEvent(payload);
    } catch (e: any) {
      // Ошибку обработки только логируем, ответ всё равно 200 — иначе
      // Resend/Svix будет бесконечно ретраить один и тот же вебхук.
      this.logger.error(`Ошибка обработки входящего письма: ${e?.message || e}`);
    }
    return res.status(200).json({ ok: true });
  }

  private async handleEvent(payload: any): Promise<void> {
    const type = payload?.type;
    // На один и тот же URL Resend может слать разные типы событий
    // (доставлено/открыто/отклонено и т.д.) — нас интересует только
    // реально ВХОДЯЩЕЕ письмо. Название события уточняется в панели
    // Resend при подключении вебхука; поддерживаем оба варианта
    // написания на случай расхождения версий API.
    if (type && type !== 'email.received' && type !== 'inbound.email') {
      this.logger.debug(`Пропускаю событие вебхука типа "${type}" — не входящее письмо`);
      return;
    }

    const data = payload?.data || {};
    const recipients = extractAddresses(data.to);
    if (recipients.length === 0) {
      this.logger.warn('Входящий вебхук без получателей в поле "to" — пропускаю');
      return;
    }

    const from = extractSingleAddress(data.from);
    const subject: string = data.subject || '';
    const text: string | undefined = data.text || undefined;
    const html: string | undefined = data.html || undefined;
    const resendId: string | undefined = data.email_id || data.id || undefined;

    for (const to of recipients) {
      const saved = await this.store.saveInbound({
        mailboxAddress: to,
        fromAddress: from.address || 'unknown@voidops.ru',
        fromName: from.name,
        subject,
        bodyText: text,
        bodyHtml: html,
        resendId,
      });
      if (saved) {
        this.logger.log(`Входящее письмо сохранено: to=${to}, from=${from.address}, userId=${saved.userId}`);
      }
    }
  }
}

// ==========================================
// Разбор адресов из payload Resend
// ==========================================
// Формат полей to/from у вебхуков варьируется в зависимости от того, как
// письмо было отправлено отправителю (простая строка "a@b.com", строка
// с именем "Имя <a@b.com>", объект {email, name} или массив того и
// другого) — разбираем максимально терпимо ко всем вариантам, чтобы не
// потерять письмо из-за формата, который мы не предусмотрели.

function parseAddressString(raw: string): { address: string; name?: string } {
  const match = raw.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    return { address: match[2].trim().toLowerCase(), name: name || undefined };
  }
  return { address: raw.trim().toLowerCase() };
}

function extractSingleAddress(value: any): { address: string | null; name?: string } {
  if (!value) return { address: null };
  if (typeof value === 'string') return parseAddressString(value);
  if (typeof value === 'object' && value.email) {
    return { address: String(value.email).toLowerCase(), name: value.name || undefined };
  }
  return { address: null };
}

function extractAddresses(value: any): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((v) => {
      if (typeof v === 'string') return parseAddressString(v).address;
      if (v && typeof v === 'object' && v.email) return String(v.email).toLowerCase();
      return null;
    })
    .filter((v): v is string => !!v);
}
