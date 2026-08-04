import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WebFetchService } from './webfetch.service';

class WebFetchDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url!: string;
}

// Единственный endpoint: POST /api/v1/webfetch/read с { url } → извлекает
// текст со страницы и возвращает { url, title, text, truncated }.
// Фронт сам решает, что делать с полученным текстом — обычно подмешивает
// в сообщение к LLM.
@Controller('webfetch')
@UseGuards(JwtAuthGuard)
export class WebFetchController {
  constructor(private readonly webfetch: WebFetchService) {}

  @Post('read')
  read(@Body() dto: WebFetchDto) {
    return this.webfetch.fetchUrl(dto.url);
  }
}
