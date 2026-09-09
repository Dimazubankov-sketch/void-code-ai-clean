
// ==========================================
// ЦВЕТОВАЯ ПАЛИТРА ДЛЯ ЗНАЧКОВ (иконки в гайде и т.п.)
// ==========================================
// Пары фон/текст по названию цвета — переиспользуются везде, где нужен
// цветной значок-иконка (например, разделы «Гида по возможностям»).
export const BLOCK_COLORS = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',     text: 'text-blue-600 dark:text-blue-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400' },
    teal:   { bg: 'bg-teal-50 dark:bg-teal-900/20',     text: 'text-teal-600 dark:text-teal-400' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/20',       text: 'text-red-500 dark:text-red-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-600 dark:text-indigo-400' },
    gray:   { bg: 'bg-gray-100 dark:bg-gray-800',       text: 'text-gray-600 dark:text-gray-300' },
    green:  { bg: 'bg-green-50 dark:bg-green-900/20',   text: 'text-green-600 dark:text-green-400' },
    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' },
    pink:   { bg: 'bg-pink-50 dark:bg-pink-900/20',     text: 'text-pink-600 dark:text-pink-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-[#5b32d4] dark:text-purple-400' },
    emerald:{ bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',   text: 'text-amber-600 dark:text-amber-400' },
};


// Порог, при котором показываем предупреждение о низком балансе.
export const LOW_BALANCE_THRESHOLD = 150;


// ==========================================
// МАГАЗИН АГЕНТОВ
// ==========================================
// Агентов больше нельзя собрать вручную (конструктор блоков убран) —
// только купить готового в магазине. У агентов нет узких «профессий»:
// один универсальный вид, конкретные задачи включаются в Cockpit.
export const MAIL_PROVIDERS = [
    { id: 'voidops', name: 'Voidops', icon: 'ProviderVoidops' },
    { id: 'gmail', name: 'Gmail', icon: 'ProviderGmail' },
    { id: 'mailru', name: 'Mail.ru', icon: 'ProviderMailru' },
    { id: 'yandex', name: 'Яндекс Почта', icon: 'ProviderYandex' },
    { id: 'outlook', name: 'Outlook', icon: 'ProviderOutlook' },
    { id: 'icloud', name: 'iCloud Mail', icon: 'ProviderIcloud' },
];

// Мессенджеры — для агента техподдержки (в каком мессенджере он отвечает)
export const MESSENGERS = [
    { id: 'telegram', name: 'Telegram', icon: 'MsgTelegram' },
    { id: 'whatsapp', name: 'WhatsApp', icon: 'MsgWhatsapp' },
    { id: 'vk', name: 'ВКонтакте', icon: 'MsgVk' },
    { id: 'discord', name: 'Discord', icon: 'MsgDiscord' },
    { id: 'viber', name: 'Viber', icon: 'MsgViber' },
    { id: 'max', name: 'MAX', icon: 'MsgMax' },
];

// Цена первого агента для новых пользователей — 0: выдаётся бесплатно
// как подарок сразу после регистрации (см. shared/lib/accounts.jsx).
export const FIRST_AGENT_GIFT_PRICE = 0;

// В магазине строго два вида: «Оркестраторы» и «Агенты» — универсальные,
// без узких профессий.
// Магазин теперь продаёт агентов-ПРОФЕССИЙ (у каждой — свои настройки в
// чате), а не «универсальных» агентов. Первая профессия — «Агент звонков».
// Универсальный агент остаётся для агент-режима внутри обычного чата
// (activeAgentId), но в магазине больше не продаётся.
export const AGENT_STORE = [
    {
        id: 'agent_calls',
        kind: 'worker',
        profession: 'calls',
        name: 'Агент звонков',
        tagline: 'Принимает входящие и звонит сам, ведёт диалог голосом',
        price: 990,
        icon: 'Phone',
        color: 'green',
        abilities: [
            'Отвечает на входящие звонки на ваш номер',
            'Сам совершает исходящие звонки по задаче',
            'Ведёт живой диалог выбранным голосом',
            'После звонка вносит данные через коннекторы (например, в таблицу)',
        ],
        description: 'Агент-профессия «Звонки»: привязывается к вашему номеру, принимает и совершает звонки, ведёт диалог голосом по вашим инструкциям и заносит результат через коннекторы. Настройки (номер, модель-мозг, голос, инструкции, коннекторы) открываются в чате агента по кнопке «⋮».',
    },
];

// Оркестраторы — отдельная премиальная категория (покупаются, не собираются)
export const ORCHESTRATOR_PRODUCTS = [
    {
        id: 'orchestrator_standard',
        name: 'Оркестратор',
        tagline: 'Дирижёр, раздающий задачи агентам',
        icon: 'Robot',
        premium: true,
        price: 1500,
        abilities: [
            'Раздаёт задачи вашим агентам',
            'Согласует шаги с вами перед запуском',
            'Собирает отчёты в одном месте',
        ],
        description: 'Оркестратор координирует работу нескольких агентов: получает задачу, разбивает её на шаги, распределяет между агентами и приносит вам отчёт на подтверждение. Готов к работе сразу после покупки.',
    },
];

export const getStoreAgent = (id) => AGENT_STORE.find(a => a.id === id);
export const getOrchestratorProduct = (id) => ORCHESTRATOR_PRODUCTS.find(a => a.id === id);
