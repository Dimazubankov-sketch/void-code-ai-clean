import { Body, Controller, Get, Param, Post, Req, UseGuards, ForbiddenException, ParseIntPipe } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from './mail.service';
import { decryptSecret } from '../../common/crypto/encryption.util';

class SendMailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;
}

@Controller('mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  // Достаёт и расшифровывает данные ящика текущего пользователя. Бросает
  // понятную ошибку, если ящик ещё не создан (например, регистрация
  // прошла в момент, когда Migadu был недоступен — см. MailProvisioningService).
  private async getCredentials(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mailboxAddress || !user.mailboxPasswordEnc) {
      throw new ForbiddenException('Персональный почтовый ящик ещё не создан. Попробуйте зайти в почту чуть позже.');
    }
    return { address: user.mailboxAddress, password: decryptSecret(user.mailboxPasswordEnc) };
  }

  @Get('inbox')
  async inbox(@Req() req: any) {
    const creds = await this.getCredentials(req.user.userId);
    const messages = await this.mail.listInbox(creds);
    return { address: creds.address, messages };
  }

  @Get('messages/:uid')
  async message(@Req() req: any, @Param('uid', ParseIntPipe) uid: number) {
    const creds = await this.getCredentials(req.user.userId);
    const message = await this.mail.getMessage(creds, uid);
    return { message };
  }

  @Post('send')
  async send(@Req() req: any, @Body() dto: SendMailDto) {
    const creds = await this.getCredentials(req.user.userId);
    await this.mail.sendMail(creds, dto.to, dto.subject, dto.body);
    return { ok: true, from: creds.address };
  }
}
