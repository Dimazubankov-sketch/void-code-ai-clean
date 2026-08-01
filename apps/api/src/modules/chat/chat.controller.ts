import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
  // системный промпт по умолчанию.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;
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

  @Post(':id/messages')
  send(@Req() req: any, @Param('id') chatId: string, @Body() dto: SendMessageDto) {
    return this.chat.sendMessage(req.user.userId, chatId, dto.content, dto.model, dto.systemPrompt);
  }
}
