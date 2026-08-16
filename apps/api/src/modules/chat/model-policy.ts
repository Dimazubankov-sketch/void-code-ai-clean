import { HttpException, HttpStatus } from '@nestjs/common';

// ==========================================
// model-policy.ts — единая точка правды для маршрутизации моделей
// ==========================================
// Документ 10, пункт «Обязательные правила архитектуры»:
//   1. Маршрутизация model = f(plan, mode) только на backend.
//   2. Free никогда не должен получить Grok 4.6 / Opus / Fable.
//   3-6. Лимиты, whitelist, конфигурация через env — всё здесь, в одном
//        месте, а не размазано по контроллерам.
//
// «mode» — это то же самое понятие, что «Void Mini/Plus/Pro» в остальном
// проекте (внутренние ID flash/flash_ext/pro), плюс новый режим ultra,
// доступный только на тарифе Ultra. Совмещать их в одну ось (а не изобретать
// новую терминологию) осознанно — фронтенд уже оперирует этими ID.

export type PlanName = 'FREE' | 'PLUS' | 'PRO' | 'ULTRA';
export type ModeId = 'flash' | 'flash_ext' | 'pro' | 'ultra';

const normalizePlan = (plan?: string): PlanName => {
  const p = (plan || 'FREE').toUpperCase();
  return (['FREE', 'PLUS', 'PRO', 'ULTRA'].includes(p) ? p : 'FREE') as PlanName;
};

// ------------------------------------------------------------------
// WHITELIST. null = режим недоступен на этом тарифе — resolveModel
// бросает понятную ошибку, а не тихо подставляет что-то другое.
//
// PLUS в исходном ТЗ не описан отдельно (там только Free/Pro/Ultra) —
// сознательно приравнен к PRO: это платный тариф ниже PRO, и давать ему
// доступ к тем же моделям, что и PRO, безопаснее, чем гадать другой набор.
const MODEL_WHITELIST: Record<PlanName, Record<ModeId, string | null>> = {
  FREE: {
    flash: 'deepseek/deepseek-v4-flash-0731',
    flash_ext: null,
    pro: null,
    ultra: null,
  },
  PLUS: {
    flash: 'deepseek/deepseek-v4-flash-0731',
    flash_ext: 'x-ai/grok-4.3',
    pro: 'x-ai/grok-4.6',
    ultra: null,
  },
  PRO: {
    flash: 'deepseek/deepseek-v4-flash-0731',
    flash_ext: 'x-ai/grok-4.3',
    pro: 'x-ai/grok-4.6',
    ultra: null,
  },
  ULTRA: {
    flash: 'x-ai/grok-4.3',
    flash_ext: 'x-ai/grok-4.6',
    pro: 'anthropic/claude-opus-5',
    ultra: 'anthropic/claude-fable-5',
  },
};

// Для кода/сайта на Pro-режиме (тарифы Pro/Ultra) — авто-роутинг на
// claude-sonnet-5, как явно попросили в ТЗ («дать выбор/авто-route»).
// Реализован как авто-route по эвристике намерения — отдельного
// переключателя в UI не заводим, это внутренняя деталь маршрутизации.
const CODE_INTENT_MODEL = 'anthropic/claude-sonnet-5';
const CODE_INTENT_RE = /(напиши|сделай|создай|сверстай|отрефактори|почини|debug|исправь ошибк)[^.!?]{0,40}(код|сайт|компонент|скрипт|приложени|страниц|функци|api|бэкенд|фронтенд)/i;

export function isCodeIntent(text: string): boolean {
  return CODE_INTENT_RE.test(String(text || ''));
}

// ------------------------------------------------------------------
// Лимиты — конфигурируемые через env (документ 10, пункт «конфиг в
// env/config»), с дефолтами из середины заявленных в ТЗ диапазонов.
// Переменные окружения ЦЕЛОЧИСЛЕННЫЕ (токены/запросы), крутятся без
// передеплоя логики — только рестарт процесса, чтобы подхватить .env.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const PLAN_TOKEN_LIMITS: Record<PlanName, number> = {
  FREE: envInt('VOID_LIMIT_TOKENS_FREE', 100_000),
  PLUS: envInt('VOID_LIMIT_TOKENS_PLUS', 800_000), // не задан в ТЗ явно — между Free и Pro
  PRO: envInt('VOID_LIMIT_TOKENS_PRO', 2_000_000),
  ULTRA: envInt('VOID_LIMIT_TOKENS_ULTRA', 7_000_000),
};

// «Тяжёлые» генерации (код/сайт) на Free — отдельный, гораздо более
// жёсткий потолок, независимый от общего токен-бюджета: даже если токены
// ещё остались, третий подряд «сделай сайт» в сутки на Free уже не пройдёт.
export const FREE_HEAVY_GEN_LIMIT = envInt('VOID_LIMIT_HEAVY_GEN_FREE', 2);
export const FREE_MAX_OUTPUT_TOKENS = envInt('VOID_LIMIT_MAX_OUTPUT_FREE', 1200);

// Отдельный потолок конкретно на Fable (Ultra) — сверх него доступ только
// через списание с кошелька (pay-as-you-go), не бесплатно и без лимита.
export const ULTRA_FABLE_TOKEN_CAP = envInt('VOID_LIMIT_FABLE_TOKENS', 500_000);
// Оценочная цена за 1000 токенов Fable при списании сверх лимита, в копейках.
export const FABLE_OVERAGE_KOPECKS_PER_1K = envInt('VOID_FABLE_OVERAGE_KOPECKS_PER_1K', 150);

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ------------------------------------------------------------------
// Структурированная ошибка лимита — ровно та форма, которую просит ТЗ:
// { code, message, resetAt, upgradeHint }. HttpException позволяет отдать
// произвольное тело с явным статусом (402/403), а не только строку.
function limitExceededError(status: number, code: string, message: string, upgradeHint?: string): never {
  const resetAt = new Date();
  resetAt.setUTCHours(24, 0, 0, 0); // сброс в полночь UTC — та же граница, что у dayKey
  throw new HttpException({ code, message, resetAt: resetAt.toISOString(), upgradeHint }, status);
}

// ------------------------------------------------------------------
// resolveModel — единственное место, где строка от клиента превращается
// в реальный slug модели у провайдера. Клиент передаёт ЖЕЛАЕМЫЙ mode
// (то, что раньше слепо использовалось как есть) — здесь он проверяется
// против тарифа и намерения (код/сайт), а не доверяется напрямую.
export function resolveModel(planRaw: string | undefined, modeRaw: string | undefined, userText: string): { model: string; mode: ModeId; plan: PlanName } {
  const plan = normalizePlan(planRaw);
  const mode: ModeId = (['flash', 'flash_ext', 'pro', 'ultra'].includes(String(modeRaw)) ? modeRaw : 'flash') as ModeId;

  const whitelisted = MODEL_WHITELIST[plan][mode];
  if (!whitelisted) {
    limitExceededError(
      HttpStatus.FORBIDDEN,
      'MODE_NOT_ALLOWED',
      `Режим «${mode}» недоступен на тарифе ${plan}. Обновите тариф, чтобы получить доступ.`,
      'upgrade',
    );
  }

  // Авто-роутинг на код/сайт: только там, где это явно разрешено ТЗ —
  // режим pro на тарифах Pro/Ultra, и режим flash_ext на Ultra.
  const codeEligible =
    (mode === 'pro' && (plan === 'PRO' || plan === 'ULTRA' || plan === 'PLUS')) ||
    (mode === 'flash_ext' && plan === 'ULTRA');
  if (codeEligible && isCodeIntent(userText)) {
    return { model: CODE_INTENT_MODEL, mode, plan };
  }

  return { model: whitelisted, mode, plan };
}

// ------------------------------------------------------------------
// checkLimits — проверяет счётчик ПЕРЕД обращением к провайдеру.
// counter — текущая запись UsageCounter за сегодня (может быть null,
// если это первый запрос пользователя за день).
export function checkLimits(params: {
  plan: PlanName;
  mode: ModeId;
  counter: { tokensUsedToday: number; heavyGenUsed: number; fableTokensToday: number } | null;
  isHeavyGen: boolean;
  isFableOverage: boolean; // уже посчитано снаружи: fableTokensToday >= cap
}) {
  const { plan, mode, counter, isHeavyGen, isFableOverage } = params;
  const tokensUsed = counter?.tokensUsedToday ?? 0;
  const limit = PLAN_TOKEN_LIMITS[plan];

  if (tokensUsed >= limit && !(plan === 'ULTRA' && isFableOverage)) {
    // На Ultra общий токен-лимит исчерпан — доступ дальше только через
    // Fable pay-as-you-go (проверяется отдельно в billing-обвязке
    // chat.service.ts), остальным тарифам просто отказываем.
    if (plan !== 'ULTRA') {
      limitExceededError(
        HttpStatus.PAYMENT_REQUIRED,
        'DAILY_TOKEN_LIMIT',
        'Дневной лимит токенов исчерпан. Попробуйте завтра или обновите тариф.',
        'upgrade',
      );
    }
  }

  if (plan === 'FREE' && isHeavyGen && (counter?.heavyGenUsed ?? 0) >= FREE_HEAVY_GEN_LIMIT) {
    limitExceededError(
      HttpStatus.PAYMENT_REQUIRED,
      'HEAVY_GEN_LIMIT',
      `На бесплатном тарифе доступно не более ${FREE_HEAVY_GEN_LIMIT} тяжёлых генераций (код/сайт) в сутки. Попробуйте завтра или обновите тариф.`,
      'upgrade',
    );
  }
}

// max_tokens на Free — режем «сделай сайт»/большой рефакторинг по
// потолку вывода, а не только по общему токен-бюджету (документ 10,
// пункт 4).
export function maxOutputTokensFor(plan: PlanName, isHeavyGen: boolean): number | undefined {
  if (plan === 'FREE' && isHeavyGen) return FREE_MAX_OUTPUT_TOKENS;
  return undefined; // остальным — дефолт провайдера/вызывающего кода
}
