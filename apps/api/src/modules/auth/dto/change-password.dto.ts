import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Новый пароль — минимум 8 символов' })
  @MaxLength(72)
  newPassword!: string;
}
