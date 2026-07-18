export const AI_MODELS = [
    { id: 'flash', name: 'Flash', badge: 'Безлимитно', cost: 0, desc: 'Быстрые ответы и простые задачи. Безлимитно и бесплатно.', sysPrompt: 'Ты — Void Code AI (модель Flash). Твоя цель — отвечать быстро и лаконично.' },
    { id: 'flash_ext', name: 'Flash (Расширенный)', badge: 'Рабочая лошадка', cost: 1, desc: 'Глубокий анализ, обучение и написание кода средних задач.', sysPrompt: 'Ты — мощный универсальный ассистент Void Code AI. Отвечай развернуто.' },
    { id: 'pro', name: 'Void Code Pro', badge: 'Максимальная мощность', cost: 3, desc: 'Самая мощная модель. Архитектура, математика и сложный код.', sysPrompt: 'Ты — элитный разработчик Void Code AI. Пиши идеальный код.' }
];


// Лимиты по тарифам: дневной и недельный (используются на вкладке "Лимиты"
// и при проверке доступности премиум-моделей). Недельный лимит — это
// независимый "длинный" счётчик, который растёт медленнее дневного.
export const PLAN_LIMITS = {
    free:     { daily: 10,       weekly: 70 },
    plus:     { daily: 200,      weekly: 1400 },
    pro:      { daily: 1000,     weekly: 7000 },
    pro_plus: { daily: Infinity, weekly: Infinity }
};


export const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.free;


// Оставлено для обратной совместимости: возвращает только дневной лимит.
export const getMaxLimits = (plan) => getPlanLimits(plan).daily;
