import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// Тело запроса POST /mail/send. Поле называется "body" (а не text/html),
// потому что именно так его шлёт существующий фронтенд
// (apps/web/src/shared/api/mail.jsx -> sendMail(to, subject, body)) —
// специально подобрано под уже готовый UI, чтобы ничего не переделывать
// на клиенте.
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
}
