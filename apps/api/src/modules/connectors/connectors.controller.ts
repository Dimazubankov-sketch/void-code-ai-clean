import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConnectorsService } from './connectors.service';

// ==========================================
// ConnectorsController (#3) — управление подключениями (требует входа)
// ==========================================
// Реальные подключения внешних сервисов. Telegram и «Звонки» подключаются
// прямо здесь (POST с данными), GitHub/Notion — отдают ссылку авторизации,
// по которой фронт открывает окно OAuth; сам обмен кода на токен приходит
// в отдельный публичный контроллер (без JwtAuthGuard) — редиректом из
// браузера провайдера.

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  @Get()
  list(@Req() req: any) {
    return this.connectors.list(req.user.userId);
  }

  @Delete(':provider')
  disconnect(@Req() req: any, @Param('provider') provider: string) {
    return this.connectors.disconnect(req.user.userId, provider);
  }

  // Telegram — подключение по бот-токену.
  @Post('telegram')
  telegram(@Req() req: any, @Body('botToken') botToken: string) {
    return this.connectors.connectTelegram(req.user.userId, botToken);
  }

  // Звонки — привязка номера (Voximplant).
  @Post('calls')
  calls(@Req() req: any, @Body('phone') phone: string) {
    return this.connectors.connectCalls(req.user.userId, phone);
  }

  // GitHub — вернуть ссылку авторизации (фронт открывает её в окне).
  @Get('github/start')
  githubStart(@Req() req: any) {
    return { url: this.connectors.githubAuthUrl(req.user.userId) };
  }

  // Notion — вернуть ссылку авторизации.
  @Get('notion/start')
  notionStart(@Req() req: any) {
    return { url: this.connectors.notionAuthUrl(req.user.userId) };
  }
}

// ==========================================
// ConnectorsOAuthController — публичные callback'и OAuth (БЕЗ JwtAuthGuard)
// ==========================================
// Сюда провайдер (GitHub/Notion) редиректит браузер пользователя после
// согласия. Авторизацию несёт подписанный state (внутри — userId), поэтому
// JwtAuthGuard здесь намеренно НЕ применяется. После успешного обмена —
// редирект обратно в приложение с пометкой результата.
@Controller('connectors')
export class ConnectorsOAuthController {
  constructor(private readonly connectors: ConnectorsService) {}

  private appUrl() {
    return (process.env.APP_URL || 'https://void-code.ru').replace(/\/$/, '');
  }

  private done(res: Response, provider: string, ok: boolean) {
    const status = ok ? 'ok' : 'error';
    res.redirect(`${this.appUrl()}/?connector=${encodeURIComponent(provider)}&status=${status}`);
  }

  @Get('github/callback')
  async githubCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.connectors.githubCallback(code, state);
      this.done(res, 'github', true);
    } catch {
      this.done(res, 'github', false);
    }
  }

  @Get('notion/callback')
  async notionCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.connectors.notionCallback(code, state);
      this.done(res, 'notion', true);
    } catch {
      this.done(res, 'notion', false);
    }
  }
}
