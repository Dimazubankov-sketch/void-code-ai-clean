import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SupportService } from './support.service';

class SupportHistoryItemDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

class SupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  // История текущего диалога поддержки (без системного промпта —
  // он всегда фиксирован на сервере, см. SupportService).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SupportHistoryItemDto)
  history?: SupportHistoryItemDto[];

  // Скриншоты проблемы — до 4 штук за сообщение, как и в обычном чате.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  images?: string[];
}

// Отдельный, не связанный с обычным чатом эндпоинт: диалоги с
// техподдержкой НЕ создают ChatSession в БД и НЕ расходуют дневной/
// недельный лимит запросов пользователя — иначе человек, у которого
// как раз кончился лимит, не смог бы даже пожаловаться на это в поддержку.
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('message')
  async send(@Req() req: any, @Body() dto: SupportMessageDto) {
    const content = await this.support.reply(dto.message, dto.history || [], dto.images);
    return { content };
  }
}
