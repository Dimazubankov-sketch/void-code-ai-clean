import { Injectable, Logger } from '@nestjs/common';
import { Email, EmailFolder } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// ==========================================
// MailStoreService — хранение писем в БД (папки Void Mail)
// ==========================================
// Вся работа с таблицей Email (Prisma) сосредоточена здесь — контроллеры
// (MailController, MailWebhookController) только валидируют вход/выход,
// сюда не лезут напрямую в Prisma. Все методы, где это применимо,
// проверяют userId — письмо одного человека никогда не должно быть
// доступно через id другому (простая защита от IDOR).

// URL-часть папки (человекочитаемая, в нижнем регистре) -> значение enum
// в БД. Отдельный маппинг, а не toUpperCase() на входе — чтобы
// невалидное значение в URL (например, опечатка) не пыталось попасть в
// Prisma-запрос, а сразу отсеивалось контроллером как 400.
const FOLDER_URL_MAP: Record<string, EmailFolder> = {
  inbox: 'INBOX',
  sent: 'SENT',
  drafts: 'DRAFTS',
  trash: 'TRASH',
  spam: 'SPAM',
};

function toPreview(text?: string | null, html?: string | null): string {
  const raw = text || (html ? html.replace(/<[^>]*>/g, ' ') : '') || '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Публичная форма письма для списка папки — без полного текста (дорого
// гонять целиком по сети при каждом обновлении списка), полный текст
// подтягивается отдельно при открытии письма (см. getById в контроллере).
function toSummary(e: Email) {
  return {
    id: e.id,
    folder: e.folder,
    fromAddress: e.fromAddress,
    fromName: e.fromName,
    toAddress: e.toAddress,
    subject: e.subject,
    preview: toPreview(e.bodyText, e.bodyHtml),
    isRead: e.isRead,
    createdAt: e.createdAt,
  };
}

@Injectable()
export class MailStoreService {
  private readonly logger = new Logger(MailStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  parseFolder(raw: string): EmailFolder | null {
    return FOLDER_URL_MAP[(raw || '').toLowerCase()] ?? null;
  }

  async listFolder(userId: string, folder: EmailFolder) {
    const rows = await this.prisma.email.findMany({
      where: { userId, folder },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  async getById(userId: string, id: string): Promise<Email | null> {
    return this.prisma.email.findFirst({ where: { id, userId } });
  }

  async markRead(userId: string, id: string, isRead: boolean): Promise<Email | null> {
    const existing = await this.getById(userId, id);
    if (!existing) return null;
    if (existing.isRead === isRead) return existing; // нет изменений — не дёргаем БД зря
    return this.prisma.email.update({ where: { id }, data: { isRead } });
  }

  // Возвращает null, если письмо не найдено/не принадлежит пользователю.
  // Иначе { deleted: true } — письмо удалено навсегда (было уже в
  // Корзине или это был черновик — для черновиков «мягкого» удаления не
  // нужно, они и так не видны никому, кроме автора), либо
  // { deleted: false, email } — письмо перемещено в Корзину.
  async removeOrTrash(userId: string, id: string): Promise<{ deleted: boolean; email?: Email } | null> {
    const existing = await this.getById(userId, id);
    if (!existing) return null;
    if (existing.folder === 'TRASH' || existing.folder === 'DRAFTS') {
      await this.prisma.email.delete({ where: { id } });
      return { deleted: true };
    }
    const email = await this.prisma.email.update({ where: { id }, data: { folder: 'TRASH' } });
    return { deleted: false, email };
  }

  async createDraft(userId: string, dto: { to?: string; subject?: string; body?: string }): Promise<Email> {
    return this.prisma.email.create({
      data: {
        userId,
        folder: 'DRAFTS',
        fromAddress: '',
        toAddress: dto.to || '',
        subject: dto.subject || '',
        bodyText: dto.body || '',
        isRead: true,
      },
    });
  }

  // null — черновик не найден/не принадлежит пользователю/уже не черновик
  // (например, его успели отправить в параллельной вкладке).
  async updateDraft(userId: string, id: string, dto: { to?: string; subject?: string; body?: string }): Promise<Email | null> {
    const existing = await this.getById(userId, id);
    if (!existing || existing.folder !== 'DRAFTS') return null;
    return this.prisma.email.update({
      where: { id },
      data: {
        toAddress: dto.to ?? existing.toAddress,
        subject: dto.subject ?? existing.subject,
        bodyText: dto.body ?? existing.bodyText,
      },
    });
  }

  // Записывает отправленное письмо в «Отправленные». Если передан
  // draftId и он реально указывает на черновик текущего пользователя —
  // ПРЕВРАЩАЕМ этот же черновик в отправленное письмо (одна строка в
  // БД), а не создаём новую и оставляем черновик висеть сиротой.
  async saveSent(
    userId: string,
    params: {
      fromAddress: string;
      fromName?: string;
      to: string;
      subject: string;
      body: string;
      resendId?: string | null;
      replyToId?: string;
      draftId?: string;
    },
  ): Promise<Email> {
    if (params.draftId) {
      const draft = await this.getById(userId, params.draftId);
      if (draft && draft.folder === 'DRAFTS') {
        return this.prisma.email.update({
          where: { id: params.draftId },
          data: {
            folder: 'SENT',
            fromAddress: params.fromAddress,
            fromName: params.fromName,
            toAddress: params.to,
            subject: params.subject,
            bodyText: params.body,
            resendId: params.resendId || undefined,
            replyToId: params.replyToId ?? draft.replyToId,
            isRead: true,
          },
        });
      }
    }
    return this.prisma.email.create({
      data: {
        userId,
        folder: 'SENT',
        fromAddress: params.fromAddress,
        fromName: params.fromName,
        toAddress: params.to,
        subject: params.subject,
        bodyText: params.body,
        resendId: params.resendId || undefined,
        replyToId: params.replyToId,
        isRead: true,
      },
    });
  }

  // Вызывается вебхуком Resend при входящем письме. mailboxAddress —
  // один из адресов из поля "to" письма; ищем пользователя Void Code с
  // таким личным адресом (сравнение без учёта регистра — почтовые
  // адреса регистронезависимы в local-part на практике). Возвращает
  // null, если такого пользователя нет (письмо пришло на несуществующий
  // или чужой адрес — молча игнорируем, это не ошибка).
  async saveInbound(params: {
    mailboxAddress: string;
    fromAddress: string;
    fromName?: string;
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    resendId?: string;
  }): Promise<Email | null> {
    // Идемпотентность: Resend/Svix при сетевых проблемах может прислать
    // один и тот же вебхук повторно — по resendId не создаём дубликат.
    if (params.resendId) {
      const existing = await this.prisma.email.findUnique({ where: { resendId: params.resendId } });
      if (existing) return existing;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { mailboxAddress: { equals: params.mailboxAddress, mode: 'insensitive' } },
          { email: { equals: params.mailboxAddress, mode: 'insensitive' } },
        ],
      },
    });
    if (!user) {
      this.logger.debug(`Входящее письмо на ${params.mailboxAddress} — нет пользователя с таким адресом`);
      return null;
    }

    return this.prisma.email.create({
      data: {
        userId: user.id,
        folder: 'INBOX',
        fromAddress: params.fromAddress,
        fromName: params.fromName,
        toAddress: params.mailboxAddress,
        subject: params.subject || '(без темы)',
        bodyText: params.bodyText,
        bodyHtml: params.bodyHtml,
        resendId: params.resendId,
        isRead: false,
      },
    });
  }
}
