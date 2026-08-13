import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from './mail.service';
import { MailStoreService } from './mail-store.service';
import { SendMailDto } from './dto/send-mail.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { UpdateReadDto } from './dto/update-read.dto';

// ==========================================
// MailController — Void Mail (папки, письма, отправка через Resend)
// ==========================================
// Все маршруты требуют авторизации — почта доступна только вошедшим
// пользователям. Сама работа с БД вынесена в MailStoreService, здесь —
// только валидация входа/выхода и связка с MailService (транспорт
// Resend). Приём ВХОДЯЩИХ писем — отдельный контроллер
// (mail-webhook.controller.ts), у него намеренно НЕТ JwtAuthGuard: его
// дёргает сервер Resend, а не пользователь из браузера.

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly store: MailStoreService,
    private readonly prisma: PrismaService,
  ) {}

  // Личный адрес текущего пользователя (username@voidops.ru) — для
  // отображения в шапке почты и на экране составления письма ("От").
  @Get('me')
  async me(@Req() req: any) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    return { address: user?.mailboxAddress || user?.email || null, name: user?.name || null };
  }

  // Список писем в папке (только заголовки/превью, без полного текста).
  // folder в URL — человекочитаемый (inbox/sent/drafts/trash/spam).
  @Get('folder/:folder')
  async listFolder(@Req() req: any, @Param('folder') folder: string) {
    const parsed = this.store.parseFolder(folder);
    if (!parsed) throw new BadRequestException('Неизвестная папка почты');
    const messages = await this.store.listFolder(req.user.userId, parsed);
    return { folder: folder.toLowerCase(), messages };
  }

  // Полный текст письма. Открытие письма из «Входящих» автоматически
  // отмечает его прочитанным (как в любом обычном почтовом клиенте) —
  // отдельный PATCH .../read остаётся для случая «отметить непрочитанным
  // обратно».
  @Get('messages/:id')
  async getMessage(@Req() req: any, @Param('id') id: string) {
    const email = await this.store.getById(req.user.userId, id);
    if (!email) throw new NotFoundException('Письмо не найдено');
    if (email.folder === 'INBOX' && !email.isRead) {
      await this.store.markRead(req.user.userId, id, true);
      email.isRead = true;
    }
    return { message: email };
  }

  @Patch('messages/:id/read')
  async setRead(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateReadDto) {
    const updated = await this.store.markRead(req.user.userId, id, dto.isRead);
    if (!updated) throw new NotFoundException('Письмо не найдено');
    return { ok: true };
  }

  // Удаление: письмо из любой обычной папки уезжает в Корзину; письмо,
  // уже лежащее в Корзине (или черновик — им «мягкое» удаление не
  // нужно), удаляется окончательно. См. MailStoreService.removeOrTrash.
  @Delete('messages/:id')
  async deleteMessage(@Req() req: any, @Param('id') id: string) {
    const result = await this.store.removeOrTrash(req.user.userId, id);
    if (!result) throw new NotFoundException('Письмо не найдено');
    return { ok: true, deleted: result.deleted };
  }

  @Post('drafts')
  async createDraft(@Req() req: any, @Body() dto: SaveDraftDto) {
    const draft = await this.store.createDraft(req.user.userId, dto);
    return { draft };
  }

  @Patch('drafts/:id')
  async updateDraft(@Req() req: any, @Param('id') id: string, @Body() dto: SaveDraftDto) {
    const draft = await this.store.updateDraft(req.user.userId, id, dto);
    if (!draft) throw new NotFoundException('Черновик не найден');
    return { draft };
  }

  @Post('send')
  async send(@Req() req: any, @Body() dto: SendMailDto) {
    // Отправитель — личный адрес АВТОРИЗОВАННОГО пользователя
    // (username@voidops.ru). mailboxAddress закрепляется при регистрации
    // (см. MailProvisioningService); email оставлен запасным вариантом
    // на случай, если у старой учётки почему-то не проставлен
    // mailboxAddress.
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    const fromAddress = user?.mailboxAddress || user?.email;
    const fromName = user?.name || fromAddress?.split('@')[0];
    if (!fromAddress) throw new ServiceUnavailableException('Не удалось определить адрес отправителя');

    // Фронтенд шлёт обычный текст в поле body — HTML-версия письма
    // генерируется автоматически внутри MailService.
    const result = await this.mail.sendEmail(dto.to, dto.subject, fromAddress, fromName, undefined, dto.body);

    // Если письмо отправлялось из черновика (draftId) — превращаем ЕГО
    // же в запись «Отправленные», иначе создаём новую запись.
    const saved = await this.store.saveSent(req.user.userId, {
      fromAddress,
      fromName,
      to: dto.to,
      subject: dto.subject,
      body: dto.body,
      resendId: result.id,
      replyToId: dto.replyToId,
      draftId: dto.draftId,
    });

    return { ok: true, id: result.id, message: saved };
  }
}
