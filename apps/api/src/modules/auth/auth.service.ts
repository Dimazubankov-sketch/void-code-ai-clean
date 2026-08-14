import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailProvisioningService } from '../mail/mail-provisioning.service';

// Текст ошибки при попытке зарегистрировать уже занятый email — задан
// точной формулировкой по ТЗ.
const EMAIL_TAKEN_MESSAGE = 'Такая почта уже существует.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailProvisioning: MailProvisioningService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    // Проверка на уникальность ДО инсёрта — быстрый и понятный путь для
    // подавляющего большинства случаев (даёт явную читаемую ошибку сразу).
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException(EMAIL_TAKEN_MESSAGE);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: (dto.name && dto.name.trim()) || email.split('@')[0],
          phone: dto.phone?.trim() || null,
        },
      });
    } catch (e: any) {
      // Страховка от гонки: если два запроса регистрации с одним и тем же
      // email прошли findUnique одновременно (до записи в БД), уникальный
      // индекс на email (schema.prisma) отклонит второй insert с кодом
      // Prisma P2002 — превращаем это в ту же понятную ошибку 409, а не
      // даём утечь сырому исключению Prisma наружу как 500.
      if (e?.code === 'P2002') throw new ConflictException(EMAIL_TAKEN_MESSAGE);
      throw e;
    }

    // Задача 1: автоматическое создание персонального почтового ящика
    // username@voidops.ru при регистрации. Намеренно ПОСЛЕ выдачи JWT не
    // блокируем ответ пользователю — ждём создание ящика синхронно здесь
    // (это быстро, обычно <1с), но если Migadu недоступен — регистрация
    // всё равно успешно завершается (см. комментарий в
    // MailProvisioningService о том, почему это не блокирующая операция).
    await this.mailProvisioning.provisionForUser(user.id, user.email, user.name || undefined);

    return this.issueToken(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Одинаковая ошибка для «нет пользователя» и «неверный пароль» —
    // не даём перебирать существующие email
    if (!user) throw new UnauthorizedException('Неверный email или пароль');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверный email или пароль');

    return this.issueToken(user.id, user.email);
  }

  private issueToken(sub: string, email: string) {
    return { accessToken: this.jwt.sign({ sub, email }) };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Текущий пароль указан неверно');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }
}
