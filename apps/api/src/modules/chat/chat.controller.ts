import { Body, Controller, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32000)
  content!: string;

  @IsString()
  model!: string;

  // Разная "личность" в зависимости от выбранной на клиенте модели
  // (Pro/Plus/Flash). Необязательное — если не прислали, бэкенд берёт
  // системный промпт по умолчанию. Лимит поднят с 4000 до 20000: после
  // раунда V3 у Void Plus/Pro системный промпт собирается из нескольких
  // блоков правил (RESPONSE_DEPTH + CODE_FORMAT + LARGE_CODE +
  // STRICT_FORMATTING + TABLES_AND_CHARTS + активные Skills) и легко
  // превышает 4000 символов — старый лимит валил запрос ошибкой валидации
  // ДО того как он вообще уходил к провайдеру. 20000 даёт большой запас
  // даже с несколькими активными скиллами одновременно.
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  systemPrompt?: string;

  // Vision: массив data-URL картинок (base64), прикреплённых к сообщению.
  // Пробрасывается провайдеру в OpenAI-совместимом multi-modal формате
  // (content: [{type:'text'},{type:'image_url'}]), если модель это
  // поддерживает. См. ChatService.sendMessage.
  @IsOptional()
  @IsArray()
  images?: string[];
}

class VoiceStreamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // Создать новую сессию чата для текущего пользователя — фронтенд
  // вызывает это один раз перед первым сообщением в новом диалоге.
  @Post()
  create(@Req() req: any) {
    return this.chat.createChat(req.user.userId);
  }

  // ==========================================
  // Heartbeat против таймаута прокси (Cloudflare/nginx)
  // ==========================================
  // После подключения домена через Cloudflare между клиентом и сервером
  // появился ещё один прокси-слой. Cloudflare на бесплатном/pro тарифе
  // обрывает соединение, если сервер молчит дольше ~100 секунд (это
  // жёсткий лимит платформы, его нельзя поднять без Enterprise-плана).
  // Void Pro на сложных задачах (например, полный сайт-лендинг) думает
  // 90-150 секунд — раньше это укладывалось в nginx-таймаут (180с), но
  // теперь Cloudflare обрывает соединение раньше, чем наш сервер вообще
  // успевает ответить, и клиент видит HTTP 504.
  //
  // Решение — heartbeat: пока идёт ожидание ответа от LLM-провайдера, раз
  // в 15 секунд шлём один байт-перевод строки в тело ответа. Любые байты,
  // дошедшие до клиента, сбрасывают таймер бездействия у Cloudflare —
  // соединение считается «живым», даже если финальный JSON ещё не готов.
  // JSON.parse() игнорирует ведущие пробельные символы по спецификации,
  // так что несколько "\n" перед настоящим телом ответа не ломают парсинг
  // на фронтенде (fetch().json() использует тот же JSON.parse).
  @Post(':id/messages')
  async send(@Req() req: any, @Param('id') chatId: string, @Body() dto: SendMessageDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'application/json');
    // Отключаем буферизацию на уровне nginx — без этого heartbeat-байты
    // могут застрять в буфере nginx и не дойти до Cloudflare вовремя.
    res.setHeader('X-Accel-Buffering', 'no');

    const heartbeat = setInterval(() => {
      try { res.write('\n'); } catch { /* соединение уже могло закрыться */ }
    }, 15_000);

    try {
      const result = await this.chat.sendMessage(req.user.userId, chatId, dto.content, dto.model, dto.systemPrompt, dto.images);
      clearInterval(heartbeat);
      res.end(JSON.stringify(result));
    } catch (e) {
      clearInterval(heartbeat);
      // Пробрасываем стандартную обработку ошибок NestJS вручную, так как
      // при @Res() без passthrough фреймворк больше не перехватывает throw
      // автоматически.
      const status = (e as any)?.status || 500;
      const message = (e as any)?.message || 'Внутренняя ошибка сервера';
      if (!res.headersSent) {
        res.status(status).json({ statusCode: status, message });
      } else {
        // Часть ответа (heartbeat-байты) уже ушла клиенту — заголовки
        // менять поздно, просто закрываем соединение с сообщением об ошибке.
        res.end(JSON.stringify({ statusCode: status, message }));
      }
    }
  }

  // ==========================================
  // Голосовой режим: SSE-поток предложений
  // ==========================================
  // Отдельный от обычного /messages эндпоинт — тот отдаёт готовый JSON
  // целиком, и трогать его нельзя (на нём весь текстовый чат). Здесь
  // Server-Sent Events: каждое законченное предложение уходит клиенту
  // сразу, и он ставит его в очередь озвучки, не дожидаясь конца ответа.
  @Post(':id/voice-stream')
  async voiceStream(@Req() req: any, @Param('id') chatId: string, @Body() dto: VoiceStreamDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Без этого nginx буферизует поток и вся идея стриминга пропадает.
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const send = (event: string, data: unknown) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* клиент отключился */ }
    };

    // Тот же приём против таймаута Cloudflare, что и в обычном /messages:
    // SSE-комментарий раз в 15с держит соединение живым в паузах.
    const heartbeat = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch { /* noop */ }
    }, 15_000);

    try {
      const full = await this.chat.streamVoiceMessage(
        req.user.userId,
        chatId,
        dto.content,
        (sentence) => send('sentence', { text: sentence }),
      );
      clearInterval(heartbeat);
      send('done', { full });
      res.end();
    } catch (e) {
      clearInterval(heartbeat);
      const message = (e as any)?.message || 'Внутренняя ошибка сервера';
      const status = (e as any)?.status || 500;
      send('error', { message, statusCode: status });
      res.end();
    }
  }
}
