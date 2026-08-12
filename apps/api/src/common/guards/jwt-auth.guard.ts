import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Диагностика задачи «Void Mini — сессия истекла»: passport-jwt по
  // умолчанию отдаёт 401 молча, без единой строчки в логе — на сервере
  // невозможно было отличить «токен реально истёк», «неверная подпись»
  // (например, JWT_SECRET сменился между рестартами процесса) или
  // «токен вообще не пришёл». Логируем причину ПЕРЕД тем, как passport
  // сгенерирует стандартный ответ 401 — само поведение (кому отдаём 401)
  // не меняется, только видимость причины в `pm2 logs void-code-api`.
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const req = context.switchToHttp().getRequest();
      const reason = info?.message || err?.message || 'нет причины (токен не пришёл?)';
      // eslint-disable-next-line no-console
      console.warn(`[JwtAuthGuard] 401 на ${req?.method} ${req?.url} — причина: ${reason}`);
    }
    return super.handleRequest(err, user, info, context);
  }
}
