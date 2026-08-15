import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VoiceService } from './voice.service';

// Аудио и base64 приходят строками в JSON — тем же способом, что фото в
// остальных модулях проекта. MaxLength щедрый: 30 секунд записи в base64
// это несколько мегабайт символов.
class CloneDto {
  @IsString() @MinLength(1) @MaxLength(60)
  title!: string;

  @IsString() @MaxLength(20_000_000)
  audio!: string; // data:audio/...;base64,...

  // Подтверждение прав на голос. Проверяется на сервере: без него запрос
  // в Fish Audio не уходит (см. VoiceComplianceService).
  @IsBoolean()
  consent!: boolean;
}

class DesignPreviewDto {
  @IsString() @MinLength(3) @MaxLength(800)
  instruction!: string;

  @IsOptional() @IsString() @MaxLength(300)
  referenceText?: string;

  @IsOptional() @IsString() @MaxLength(10)
  language?: string;
}

class DesignSaveDto {
  @IsString() @MinLength(1) @MaxLength(60)
  title!: string;

  @IsString() @MaxLength(20_000_000)
  audioBase64!: string;

  @IsOptional() @IsString() @MaxLength(800)
  instruction?: string;

  @IsBoolean()
  consent!: boolean;
}

@Controller('voices')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private readonly voices: VoiceService) {}

  // IP и user-agent сохраняем вместе с согласием — согласие должно быть
  // привязано к обстоятельствам, при которых оно дано.
  private meta(req: any, consent: boolean) {
    return {
      consent,
      ip: req.ip || req.headers?.['x-forwarded-for'] || undefined,
      userAgent: req.headers?.['user-agent'] || undefined,
    };
  }

  @Get()
  list(@Req() req: any) {
    return this.voices.listVoices(req.user.userId);
  }

  @Get('quota')
  quota(@Req() req: any) {
    return this.voices.quota(req.user.userId);
  }

  @Post('clone')
  clone(@Req() req: any, @Body() dto: CloneDto) {
    return this.voices.cloneVoice(req.user.userId, dto.title, dto.audio, this.meta(req, dto.consent));
  }

  @Post('design/preview')
  designPreview(@Req() req: any, @Body() dto: DesignPreviewDto) {
    return this.voices.designPreview(
      req.user.userId,
      dto.instruction,
      dto.referenceText || 'Привет! Это пример звучания моего голоса.',
      dto.language || 'ru',
      this.meta(req, true),
    );
  }

  @Post('design/save')
  designSave(@Req() req: any, @Body() dto: DesignSaveDto) {
    return this.voices.designSave(req.user.userId, dto.title, dto.audioBase64, dto.instruction, this.meta(req, dto.consent));
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.voices.deleteVoice(req.user.userId, id);
  }
}
