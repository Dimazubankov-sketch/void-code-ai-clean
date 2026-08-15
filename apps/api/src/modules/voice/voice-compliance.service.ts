import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

// ==========================================
// Compliance для создания и клонирования голосов
// ==========================================
// Отдельный сервис, а не логика внутри VoiceService: согласия, нарушения,
// предупреждения и блокировки — самостоятельная юридическая зона, её
// правила меняются независимо от техники синтеза.

// Версионируем текст согласия: если формулировка изменится, у уже данных
// согласий должно остаться то, с чем человек реально соглашался.
export const CONSENT_VERSION = 'voice-consent-2026-08-1';

export const CONSENT_TEXT =
  'Я подтверждаю, что это мой голос / у меня есть все права на этот голос, ' +
  'и я разрешаю Void Code использовать его для синтеза речи в рамках моего аккаунта.';

export const CLONING_WARNING_TEXT =
  'Клонировать можно только свой голос или голос, на который у вас есть права. ' +
  'Клонирование чужих голосов, голосов публичных персон и защищённых авторским ' +
  'правом персонажей запрещено. При нарушении аккаунт блокируется без возможности ' +
  'зарегистрироваться заново, а оплаченный тариф не возвращается и не компенсируется.';

// Технического барьера по содержанию голоса здесь СОЗНАТЕЛЬНО нет.
// Раньше стояла эвристика по названию и описанию, но она не была
// настоящей защитой: детектора голоса по аудио у нас нет, а человек,
// назвавший клон знаменитости «Мой голос», проходил её насквозь. При
// этом она мешала законным сценариям (тёзки, вымышленные имена,
// собственный голос с необычным названием).
//
// Вместо ложного барьера — честная модель ответственности:
// пользователь подтверждает права на голос, видит прямое предупреждение
// о последствиях, а нарушения разбираются по жалобам с уже готовыми
// механизмами ниже (лог инцидента → предупреждение письмом → блокировка).
// Компенсация за оплаченный тариф при блокировке за нарушение не
// возвращается — об этом сказано и в интерфейсе, и в Условиях.

@Injectable()
export class VoiceComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Аккаунт заблокирован — дальше вообще ничего не делаем.
  async assertNotBanned(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if ((user as any).bannedAt) {
      throw new ForbiddenException('Аккаунт заблокирован за нарушение Условий пользования');
    }
    return user;
  }

  // Проверка перед проксированием запроса в Fish Audio. Без валидного
  // согласия запрос к провайдеру не уходит вообще — это требование, а не
  // просто UI-галочка.
  async assertConsentAndContent(params: {
    userId: string;
    consent: boolean;
    title: string;
    description?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const { userId, consent, title, description, ip, userAgent } = params;
    await this.assertNotBanned(userId);

    if (!consent) {
      // Отсутствие согласия при прямом обращении к API (в интерфейсе
      // кнопка неактивна) считаем попыткой обхода и фиксируем.
      await this.logViolation(userId, 'no_consent', `title="${title}"`, ip, userAgent);
      throw new BadRequestException(
        'Создание голоса невозможно без подтверждения прав на голос. Ознакомьтесь с Условиями пользования.',
      );
    }

  }

  // Сохранить согласие как юридически значимое действие.
  async saveConsent(params: {
    userId: string; voiceId?: string; ip?: string; userAgent?: string;
  }) {
    return this.prisma.voiceConsent.create({
      data: {
        userId: params.userId,
        voiceId: params.voiceId ?? null,
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        ipAddress: params.ip ?? null,
        userAgent: params.userAgent?.slice(0, 400) ?? null,
      },
    });
  }

  // Просто записать инцидент в лог (без письма и санкций).
  async logViolation(userId: string, kind: string, details: string, ip?: string, userAgent?: string) {
    console.warn(`[VoiceCompliance] нарушение ${kind} у пользователя ${userId}: ${details}`);
    return this.prisma.voiceViolation.create({
      data: {
        userId, kind,
        details: details.slice(0, 1000),
        ipAddress: ip ?? null,
        userAgent: userAgent?.slice(0, 400) ?? null,
      },
    });
  }

  // Полный цикл: лог + предупреждение письмом + блокировка при повторе.
  async registerViolation(userId: string, kind: string, details: string, ip?: string, userAgent?: string) {
    await this.logViolation(userId, kind, details, ip, userAgent);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { warningsCount: { increment: 1 } } as any,
    });
    const warnings = (user as any).warningsCount ?? 1;

    if (warnings >= 2) {
      // Повторное нарушение — блокировка. Повторная регистрация на тот же
      // email закрыта самой моделью: email уникален, а запись остаётся с
      // отметкой bannedAt (см. проверку в auth).
      await this.prisma.user.update({
        where: { id: userId },
        data: { bannedAt: new Date(), banReason: `Повторное нарушение правил создания голосов (${kind})` } as any,
      });
      await this.sendWarningEmail(user, details, true).catch(() => { /* письмо не критично для самой блокировки */ });
      return { warnings, banned: true };
    }

    await this.sendWarningEmail(user, details, false).catch(() => { /* см. выше */ });
    return { warnings, banned: false };
  }

  // Письмо на корпоративную почту @voidops.ru. Если ящик не заведён,
  // молча пропускаем: отсутствие почты не должно ломать сам разбор
  // нарушения — оно уже зафиксировано в логах и в БД.
  private async sendWarningEmail(user: any, details: string, banned: boolean) {
    const to = user.mailboxAddress;
    if (!to) return;

    const subject = 'Предупреждение о нарушении Условий пользования Void Code';
    const text = [
      `Здравствуйте${user.name ? ', ' + user.name : ''}.`,
      '',
      'Мы зафиксировали попытку создания голоса, нарушающую Условия пользования Void Code.',
      `Что произошло: ${details}`,
      '',
      'Напоминаем: клонировать можно только собственный голос или голос, на который у вас',
      'есть документально подтверждённые права. Клонирование голосов публичных персон,',
      'знаменитостей, других людей без их разрешения и персонажей, защищённых авторским',
      'правом, запрещено.',
      '',
      banned
        ? 'Это повторное нарушение, поэтому ваш аккаунт заблокирован. Создание нового аккаунта на те же данные невозможно. Если вы считаете блокировку ошибкой, ответьте на это письмо.'
        : 'Повторное нарушение приведёт к блокировке аккаунта без возможности зарегистрироваться заново.',
      '',
      'Условия пользования: https://void-code.ru (раздел «Условия пользования» в настройках приложения).',
      '',
      'Команда Void Code',
    ].join('\n');

    await this.mail.sendEmail(to, subject, 'noreply@voidops.ru', 'Void Code', undefined, text);
  }
}
