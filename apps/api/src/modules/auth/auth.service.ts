import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Пользователь с таким email уже существует');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: email.split('@')[0] },
    });
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
}
