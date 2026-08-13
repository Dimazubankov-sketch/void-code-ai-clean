import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from './mail.service';
import { SendMailDto } from './dto/send-mail.dto';

// ==========================================
// MailController — эндпоинты почты (Resend)
// ==========================================
// Все три маршрута требуют авторизации (JwtAuthGuard) — почта доступна
// только вошедшим пользователям.

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  // Resend — API только для ОТПРАВКИ, у него нет способа читать входящие
  // письма (нет IMAP/POP3-аналога, нет "ящика" как такового). Честно
  // возвращаем пустой список вместо имитации инбокса — фронтенд
  // (NotificationCenter.jsx) корректно показывает состояние «писем нет».
  // address — личный адрес пользователя (username@voidops.ru), для
  // отображения под шапкой вкладки.
  @Get('inbox')
  async inbox(@Req() req: any) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    return { address: user?.mailboxAddress ?? null, messages: [] };
  }

  // Чтения отдельных писем нет (см. inbox выше) — оставлен для
  // совместимости с фронтендом, который может дёрнуть этот путь при
  // попытке открыть письмо из старых/кэшированных данных.
  @Get('messages/:uid')
  async message() {
    return { message: null };
  }

  @Post('send')
  async send(@Req() req: any, @Body() dto: SendMailDto) {
    // Отправитель — личный адрес АВТОРИЗОВАННОГО пользователя
    // (username@voidops.ru), а не общий системный адрес. mailboxAddress
    // закрепляется при регистрации (см. MailProvisioningService) и в
    // норме совпадает с user.email — email оставлен как запасной вариант
    // на случай, если у старой учётки почему-то не проставлен
    // mailboxAddress.
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    const fromAddress = user?.mailboxAddress || user?.email;
    const fromName = user?.name || fromAddress?.split('@')[0];

    // Фронтенд шлёт обычный текст в поле body (см. dto/send-mail.dto.ts) —
    // HTML-версия письма генерируется автоматически внутри MailService.
    const result = await this.mail.sendEmail(dto.to, dto.subject, fromAddress as string, fromName, undefined, dto.body);
    return { ok: true, id: result.id };
  }
}
