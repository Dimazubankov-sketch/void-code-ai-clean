import { IsEmail, IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Пароль — минимум 8 символов' })
  @MaxLength(72) // предел bcrypt
  password!: string;

  // Задача 9: имя и телефон теперь собираются на форме регистрации.
  // Оба опциональны на уровне DTO (не ломаем совместимость со старыми
  // клиентами/скриптами) — если имя не пришло, сервис по-прежнему
  // подставляет часть email до @ (как было раньше).
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Имя слишком длинное' })
  name?: string;

  // Намеренно без валидации формата номера здесь — страна/маска
  // проверяются на фронте при выборе; на одном номере разрешено
  // регистрировать неограниченное количество аккаунтов, поэтому телефон
  // не уникален и не является ключом поиска.
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Слишком длинный номер телефона' })
  phone?: string;
}
