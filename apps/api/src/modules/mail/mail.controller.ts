import { Body, Controller, Get, Param, Post, Req, UseGuards, ServiceUnavailableException, ParseIntPipe } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MailService } from './mail.service';

// Провайдер почты меняется с Migadu на Mailgun (см. mail.service.ts) —
// пока миграция не завершена, все три эндпоинта явно отвечают
// «недоступно», а не пытаются подключиться к удалённому Migadu.

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
  constructor(private readonly mail: MailService) {}

  @Get('inbox')
  async inbox() {
    throw new ServiceUnavailableException('Почта временно недоступна — идёт переход на нового провайдера.');
  }

  @Get('messages/:uid')
  async message(@Param('uid', ParseIntPipe) _uid: number) {
    throw new ServiceUnavailableException('Почта временно недоступна — идёт переход на нового провайдера.');
  }

  @Post('send')
  async send(@Req() _req: any, @Body() _dto: SendMailDto) {
    throw new ServiceUnavailableException('Почта временно недоступна — идёт переход на нового провайдера.');
  }
}
