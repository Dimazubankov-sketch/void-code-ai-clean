import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Тело запроса POST /mail/send. Поле называется "body" (а не text/html),
// потому что именно так его шлёт фронтенд
// (apps/web/src/shared/api/mail.jsx -> sendMail(...)) — подобрано под
// уже готовый UI, чтобы не переделывать клиент.
export class SendMailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  // Заполняется, когда письмо — ответ на другое (кнопка «Ответить» в
  // интерфейсе). Необязательно, используется только для связи писем в
  // истории — на текст самого письма не влияет.
  @IsOptional()
  @IsString()
  replyToId?: string;

  // Заполняется, когда письмо отправляется ИЗ уже открытого черновика —
  // тогда backend не создаёт новую запись в «Отправленных», а
  // превращает существующий черновик в отправленное письмо (не
  // оставляет дубликат/сирота в «Черновиках»).
  @IsOptional()
  @IsString()
  draftId?: string;
}
