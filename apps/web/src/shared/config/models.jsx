export const AI_MODELS = [
    { id: 'flash', name: 'Void Mini', badge: 'Безлимитно', cost: 0, desc: 'Быстрые ответы и простые задачи. Безлимитно и бесплатно.', sysPrompt: 'Ты — Void Code AI (модель Void Mini). Твоя цель — отвечать быстро и лаконично.' },
    { id: 'flash_ext', name: 'Void Plus', badge: 'Рабочая лошадка', cost: 1, desc: 'Глубокий анализ, обучение и написание кода средних задач.', sysPrompt: 'Ты — мощный универсальный ассистент Void Code AI. Отвечай развернуто.' },
    { id: 'pro', name: 'Void Pro', badge: 'Максимальная мощность', cost: 3, desc: 'Самая мощная модель. Архитектура, математика и сложный код.', sysPrompt: 'Ты — элитный разработчик Void Code AI. Пиши идеальный код.' }
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

// ==========================================
// УРОВНИ РАССУЖДЕНИЙ (reasoning effort)
// ==========================================
// Max доступен только с тарифа Pro и выше — на младших тарифах пункт
// показывается тусклым и не выбирается.
export const REASONING_LEVELS = [
    { id: 'low', name: 'Low', desc: 'Быстрые короткие ответы' },
    { id: 'medium', name: 'Medium', desc: 'Баланс скорости и глубины' },
    { id: 'high', name: 'High', desc: 'Глубокий разбор задачи' },
    { id: 'max', name: 'Max', desc: 'Максимальная глубина рассуждений', minPlan: 'pro' },
];

// Уровень по умолчанию: у Void Pro — High, у остальных — Medium
export const defaultReasoningFor = (modelId) => (modelId === 'pro' ? 'high' : 'medium');

// Max доступен на Pro и Ultra (pro_plus)
export const isReasoningAllowed = (levelId, userPlan) => {
    if (levelId !== 'max') return true;
    return userPlan === 'pro' || userPlan === 'pro_plus';
};

export const getReasoningLevel = (id) => REASONING_LEVELS.find(l => l.id === id) || REASONING_LEVELS[1];
