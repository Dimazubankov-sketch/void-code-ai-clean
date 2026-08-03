// ==========================================
// СЦЕНАРИЙ «РАЗМЫШЛЕНИЙ» ИИ ПО УРОВНЯМ РАССУЖДЕНИЙ
// ==========================================
// Чем выше выбранный уровень рассуждений (Low/Medium/High/Max), тем больше
// шагов проходит индикатор «думаю…» и тем дольше ИИ «размышляет» перед
// ответом — так пользователь видит, что система работает, а не зависла,
// и на тяжёлых уровнях ощущает более вдумчивую проработку задачи.
// После ответа этот же сценарий сохраняется в сообщении (reasoningTrace),
// чтобы весь ход «раздумий» можно было развернуть и посмотреть в чате.

const SCRIPTS_RU = {
    low: [
        { icon: 'Sparkles', text: 'Думаю…' },
        { icon: 'MessageSquare', text: 'Формулирую ответ…' },
    ],
    medium: [
        { icon: 'Sparkles', text: 'Думаю…' },
        { icon: 'Search', text: 'Ищу информацию…' },
        { icon: 'MessageSquare', text: 'Формулирую ответ…' },
    ],
    high: [
        { icon: 'Sparkles', text: 'Разбираю задачу…' },
        { icon: 'Search', text: 'Ищу информацию в сети…' },
        { icon: 'Globe', text: 'Проверяю несколько источников…' },
        { icon: 'BarChart', text: 'Сопоставляю факты…' },
        { icon: 'MessageSquare', text: 'Формулирую развёрнутый ответ…' },
    ],
    max: [
        { icon: 'Sparkles', text: 'Внимательно разбираю задачу…' },
        { icon: 'Search', text: 'Ищу информацию в сети…' },
        { icon: 'Globe', text: 'Просматриваю релевантные источники…' },
        { icon: 'BarChart', text: 'Сопоставляю и перепроверяю факты…' },
        { icon: 'Code', text: 'Продумываю структуру решения…' },
        { icon: 'Check', text: 'Проверяю ответ на точность…' },
        { icon: 'MessageSquare', text: 'Формулирую максимально глубокий ответ…' },
    ],
};

const SCRIPTS_EN = {
    low: [
        { icon: 'Sparkles', text: 'Thinking…' },
        { icon: 'MessageSquare', text: 'Composing the answer…' },
    ],
    medium: [
        { icon: 'Sparkles', text: 'Thinking…' },
        { icon: 'Search', text: 'Searching for information…' },
        { icon: 'MessageSquare', text: 'Composing the answer…' },
    ],
    high: [
        { icon: 'Sparkles', text: 'Breaking down the task…' },
        { icon: 'Search', text: 'Searching the web…' },
        { icon: 'Globe', text: 'Checking several sources…' },
        { icon: 'BarChart', text: 'Cross-checking the facts…' },
        { icon: 'MessageSquare', text: 'Composing a detailed answer…' },
    ],
    max: [
        { icon: 'Sparkles', text: 'Carefully analyzing the task…' },
        { icon: 'Search', text: 'Searching the web…' },
        { icon: 'Globe', text: 'Reviewing relevant sources…' },
        { icon: 'BarChart', text: 'Cross-checking the facts…' },
        { icon: 'Code', text: 'Working out the solution structure…' },
        { icon: 'Check', text: 'Double-checking accuracy…' },
        { icon: 'MessageSquare', text: 'Composing the deepest possible answer…' },
    ],
};

const SCRIPTS_ZH = {
    low: [
        { icon: 'Sparkles', text: '正在思考…' },
        { icon: 'MessageSquare', text: '正在组织回答…' },
    ],
    medium: [
        { icon: 'Sparkles', text: '正在思考…' },
        { icon: 'Search', text: '正在检索信息…' },
        { icon: 'MessageSquare', text: '正在组织回答…' },
    ],
    high: [
        { icon: 'Sparkles', text: '正在拆解问题…' },
        { icon: 'Search', text: '正在搜索网络…' },
        { icon: 'Globe', text: '正在核对多个来源…' },
        { icon: 'BarChart', text: '正在比对事实…' },
        { icon: 'MessageSquare', text: '正在组织详细回答…' },
    ],
    max: [
        { icon: 'Sparkles', text: '正在仔细分析问题…' },
        { icon: 'Search', text: '正在搜索网络…' },
        { icon: 'Globe', text: '正在查看相关来源…' },
        { icon: 'BarChart', text: '正在反复核实事实…' },
        { icon: 'Code', text: '正在构思解决方案结构…' },
        { icon: 'Check', text: '正在核实准确性…' },
        { icon: 'MessageSquare', text: '正在组织最深入的回答…' },
    ],
};

const SCRIPTS = { ru: SCRIPTS_RU, en: SCRIPTS_EN, zh: SCRIPTS_ZH };

export const buildReasoningScript = (level = 'medium', lang = 'ru') => {
    const set = SCRIPTS[lang] || SCRIPTS_RU;
    return set[level] || set.medium;
};

// Доп. задержка перед выдачей готового ответа — чем выше уровень, тем
// дольше «думает» ИИ (мс). На low/medium/high задержки нет — ответ приходит
// сразу, задержку показывает уже TypewriterMessage при печати. Оставляем
// небольшую пауза только на Max, где по легенде идёт «глубокий разбор».
// Прежние значения (200/500/900) добавляли лишний лаг ощутимый пользователю.
export const REASONING_EXTRA_DELAY_MS = {
    low: 0,
    medium: 0,
    high: 0,
    max: 400,
};

export const levelDelayMs = (level) => REASONING_EXTRA_DELAY_MS[level] ?? REASONING_EXTRA_DELAY_MS.medium;

// Интервал смены фраз в индикаторе — на высоких уровнях фразы идут
// чуть медленнее, чтобы пользователь успевал их прочитать за более
// длинный цикл размышления. Значения снижены — стало ощутимо динамичнее.
export const REASONING_PHASE_INTERVAL_MS = {
    low: 800,
    medium: 900,
    high: 850,
    max: 800,
};

export const phaseIntervalMs = (level) => REASONING_PHASE_INTERVAL_MS[level] ?? REASONING_PHASE_INTERVAL_MS.medium;
