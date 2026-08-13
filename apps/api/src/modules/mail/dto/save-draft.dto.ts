import { IsOptional, IsString, MaxLength } from 'class-validator';

// Черновик, в отличие от отправки (SendMailDto), может быть неполным —
// человек ещё печатает и мог не заполнить тему/текст, а «Кому» может
// быть невалидным email на середине ввода. Поэтому здесь нет @IsEmail и
// все поля необязательны.
export class SaveDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;
}
