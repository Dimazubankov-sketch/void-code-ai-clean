import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Пароль — минимум 8 символов' })
  @MaxLength(72) // предел bcrypt
  password!: string;
}
