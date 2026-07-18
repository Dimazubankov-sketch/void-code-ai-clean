import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32000)
  content!: string;

  @IsString()
  model!: string;
}

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post(':id/messages')
  send(@Req() req: any, @Param('id') chatId: string, @Body() dto: SendMessageDto) {
    return this.chat.sendMessage(req.user.userId, chatId, dto.content, dto.model);
  }
}
