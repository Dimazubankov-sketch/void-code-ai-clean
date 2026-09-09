import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../../common/crypto/encryption.util';

// ==========================================
// ConnectorsService (#3) — РЕАЛЬНЫЕ интеграции коннекторов
// ==========================================
// Никаких заглушек: Telegram подключается настоящим бот-токеном (валидация
// через getMe), GitHub и Notion — по стандартному OAuth2 code-flow с обменом
// кода на токен, «Звонки» — привязкой номера к аккаунту Voximplant.
// Секреты (токены/бот-токен) шифруются (AES-256-GCM) и наружу не отдаются.
//
// Ключи провайдеров читаются из .env сервера (см. имена ниже). Если ключа
// нет — соответствующий метод отдаёт 503 с понятным сообщением (как в почте),
// а не падает где-то глубже. Ничего не хардкодится.

const APP_URL = () => (process.env.APP_URL || 'https://void-code.ru').replace(/\/$/, '');
// Публичный базовый адрес API (для OAuth redirect_uri). За nginx API живёт
// под /api/v1, поэтому по умолчанию собираем из APP_URL.
const API_BASE = () => (process.env.API_PUBLIC_URL || `${APP_URL()}/api/v1`).replace(/\/$/, '');

// Провайдеры, для которых подключение идёт через OAuth-редирект.
const OAUTH_PROVIDERS = ['github', 'notion'] as const;

@Injectable()
export class ConnectorsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------- Список подключённых коннекторов (без секретов) --------
  async list(userId: string) {
    const rows = await this.prisma.connector.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => ({
      provider: c.provider,
      status: c.status,
      accountLabel: c.accountLabel,
      meta: c.meta || null,
      connectedAt: c.createdAt,
    }));
  }

  async disconnect(userId: string, provider: string) {
    await this.prisma.connector.deleteMany({ where: { userId, provider } });
    return { ok: true };
  }

  // Отдаёт расшифрованный токен коннектора для внутреннего использования
  // другими модулями (агенты, звонки). Клиенту НЕ выставляется.
  async getAccessToken(userId: string, provider: string): Promise<string | null> {
    const c = await this.prisma.connector.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!c?.accessTokenEnc) return null;
    try {
      return decryptSecret(c.accessTokenEnc);
    } catch {
      return null;
    }
  }

  private async upsert(userId: string, provider: string, data: {
    accessToken?: string | null;
    refreshToken?: string | null;
    accountLabel?: string | null;
    meta?: any;
    status?: string;
  }) {
    const payload: any = {
      status: data.status || 'connected',
      accountLabel: data.accountLabel ?? null,
      meta: data.meta ?? undefined,
    };
    if (data.accessToken !== undefined) payload.accessTokenEnc = data.accessToken ? encryptSecret(data.accessToken) : null;
    if (data.refreshToken !== undefined) payload.refreshTokenEnc = data.refreshToken ? encryptSecret(data.refreshToken) : null;
    await this.prisma.connector.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...payload },
      update: payload,
    });
    return { ok: true, provider, accountLabel: data.accountLabel ?? null };
  }

  // ======================================================================
  // TELEGRAM — подключение по бот-токену (валидация через getMe)
  // ======================================================================
  // Пользователь создаёт бота у @BotFather и вставляет его токен. Мы его
  // проверяем реальным вызовом getMe и, если валиден, шифруем и сохраняем.
  // Дальше агент шлёт/принимает сообщения через этого бота.
  async connectTelegram(userId: string, botToken: string) {
    const token = (botToken || '').trim();
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
      throw new BadRequestException('Неверный формат бот-токена Telegram. Скопируйте токен из @BotFather.');
    }
    let data: any;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      data = await res.json();
    } catch {
      throw new ServiceUnavailableException('Не удалось связаться с Telegram. Попробуйте позже.');
    }
    if (!data?.ok || !data?.result) {
      throw new BadRequestException('Telegram отклонил токен — проверьте, что бот не удалён и токен скопирован полностью.');
    }
    const bot = data.result;
    return this.upsert(userId, 'telegram', {
      accessToken: token,
      accountLabel: bot.username ? `@${bot.username}` : bot.first_name || 'Telegram-бот',
      meta: { botId: bot.id, botUsername: bot.username, botName: bot.first_name },
    });
  }

  // ======================================================================
  // OAuth2 (GitHub / Notion) — подписанный state, обмен кода на токен
  // ======================================================================
  // state = base64url(userId.provider.exp).hmac — самодостаточная подпись
  // на JWT_SECRET: callback приходит БЕЗ авторизации (редирект из браузера
  // на страницу провайдера и обратно), поэтому userId переносим в state и
  // проверяем подпись, а не доверяем произвольному параметру.
  private signState(userId: string, provider: string): string {
    const exp = Date.now() + 10 * 60 * 1000; // 10 минут на прохождение OAuth
    const body = Buffer.from(`${userId}.${provider}.${exp}`).toString('base64url');
    const secret = process.env.JWT_SECRET || '';
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private verifyState(state: string): { userId: string; provider: string } {
    const [body, sig] = (state || '').split('.');
    if (!body || !sig) throw new UnauthorizedException('Некорректный state OAuth');
    const secret = process.env.JWT_SECRET || '';
    const expected = createHmac('sha256', secret).update(body).digest('base64url');
    if (sig !== expected) throw new UnauthorizedException('Подпись state не совпала');
    const [userId, provider, expStr] = Buffer.from(body, 'base64url').toString('utf8').split('.');
    if (!userId || !provider || !expStr) throw new UnauthorizedException('Повреждённый state');
    if (Date.now() > Number(expStr)) throw new UnauthorizedException('Срок действия ссылки авторизации истёк — начните заново');
    return { userId, provider };
  }

  // ---- GitHub ----
  githubAuthUrl(userId: string): string {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('GitHub OAuth не настроен на сервере (нет GITHUB_OAUTH_CLIENT_ID).');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${API_BASE()}/connectors/github/callback`,
      scope: 'repo read:user',
      state: this.signState(userId, 'github'),
      allow_signup: 'false',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async githubCallback(code: string, state: string) {
    const { userId } = this.verifyState(state);
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('GitHub OAuth не настроен на сервере.');
    let tokenJson: any;
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${API_BASE()}/connectors/github/callback`,
        }),
      });
      tokenJson = await res.json();
    } catch {
      throw new ServiceUnavailableException('Не удалось обменять код GitHub на токен.');
    }
    const accessToken = tokenJson?.access_token;
    if (!accessToken) throw new BadRequestException('GitHub не выдал токен доступа.');
    // Кто именно авторизовался — для человекочитаемой метки.
    let login: string | null = null;
    try {
      const meRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'void-code-ai', Accept: 'application/vnd.github+json' },
      });
      const me = await meRes.json();
      login = me?.login || null;
    } catch { /* метка необязательна */ }
    await this.upsert(userId, 'github', {
      accessToken,
      accountLabel: login ? `@${login}` : 'GitHub',
      meta: { login, scope: tokenJson?.scope || null },
    });
    return { userId };
  }

  // ---- Notion ----
  notionAuthUrl(userId: string): string {
    const clientId = process.env.NOTION_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('Notion OAuth не настроен на сервере (нет NOTION_CLIENT_ID).');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${API_BASE()}/connectors/notion/callback`,
      response_type: 'code',
      owner: 'user',
      state: this.signState(userId, 'notion'),
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  async notionCallback(code: string, state: string) {
    const { userId } = this.verifyState(state);
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('Notion OAuth не настроен на сервере.');
    let json: any;
    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const res = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${API_BASE()}/connectors/notion/callback`,
        }),
      });
      json = await res.json();
    } catch {
      throw new ServiceUnavailableException('Не удалось обменять код Notion на токен.');
    }
    const accessToken = json?.access_token;
    if (!accessToken) throw new BadRequestException('Notion не выдал токен доступа.');
    await this.upsert(userId, 'notion', {
      accessToken,
      accountLabel: json?.workspace_name || 'Notion',
      meta: { workspaceId: json?.workspace_id || null, workspaceName: json?.workspace_name || null, botId: json?.bot_id || null },
    });
    return { userId };
  }

  // ======================================================================
  // ЗВОНКИ (Voximplant) — привязка номера
  // ======================================================================
  // Настоящая телефония идёт через Voximplant. Здесь — привязка номера к
  // аккаунту (агент звонков потом им пользуется). Требует, чтобы на сервере
  // были заданы креды Voximplant; сам номер сохраняется в meta коннектора.
  async connectCalls(userId: string, phone: string) {
    const accId = process.env.VOXIMPLANT_ACCOUNT_ID;
    const apiKey = process.env.VOXIMPLANT_API_KEY;
    if (!accId || !apiKey) {
      throw new ServiceUnavailableException('Звонки не настроены на сервере (нет VOXIMPLANT_ACCOUNT_ID / VOXIMPLANT_API_KEY).');
    }
    const normalized = (phone || '').replace(/[^\d+]/g, '');
    if (!/^\+?\d{10,15}$/.test(normalized)) {
      throw new BadRequestException('Укажите корректный номер телефона в международном формате, например +79991234567.');
    }
    // Проверяем, что креды Voximplant валидны (лёгкий вызов GetAccountInfo).
    try {
      const params = new URLSearchParams({ account_id: accId, api_key: apiKey });
      const res = await fetch(`https://api.voximplant.com/platform_api/GetAccountInfo/?${params.toString()}`);
      const info = await res.json();
      if (info?.error) {
        throw new BadRequestException(`Voximplant отклонил ключи: ${info.error?.msg || 'ошибка авторизации'}`);
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new ServiceUnavailableException('Не удалось связаться с Voximplant. Попробуйте позже.');
    }
    return this.upsert(userId, 'phone_calls', {
      accountLabel: normalized,
      meta: { phone: normalized },
    });
  }

  isOAuthProvider(provider: string) {
    return (OAUTH_PROVIDERS as readonly string[]).includes(provider);
  }
}
