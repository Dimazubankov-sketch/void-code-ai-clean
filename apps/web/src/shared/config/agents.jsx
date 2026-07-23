
// ==========================================
// КОНСТРУКТОР AI-АГЕНТОВ — библиотека блоков
// ==========================================
// Цветовые пары (фон/текст) для карточек блоков — по категориям,
// чтобы визуально отличать триггеры / действия / AI с первого взгляда.
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


// Каждый блок: id, категория (для группировки в сайдбаре и для того,
// является ли блок "триггером" — с него может начинаться граф),
// название, подпись по умолчанию, иконка, цвет и поля настроек,
// которые будут показаны в правой панели при выборе блока.
export const BLOCK_LIBRARY = [
    // Триггеры — с них начинается выполнение агента
    { id: 'telegram_trigger', category: 'Триггеры', name: 'Telegram', subtitle: 'Получает сообщения', icon: 'Send', color: 'blue', isTrigger: true, fields: [{key:'chatId', label:'ID чата / бота', placeholder:'@my_bot или chat_id'}] },
    { id: 'webhook', category: 'Триггеры', name: 'Webhook', subtitle: 'Принимает HTTP-запрос', icon: 'Webhook', color: 'orange', isTrigger: true, fields: [{key:'path', label:'Путь', placeholder:'/webhook/my-agent'}] },
    { id: 'schedule', category: 'Триггеры', name: 'Расписание', subtitle: 'Запуск по времени', icon: 'Clock', color: 'teal', isTrigger: true, fields: [{key:'cron', label:'Периодичность', placeholder:'каждый день в 9:00'}] },
    { id: 'email_trigger', category: 'Триггеры', name: 'Почты', subtitle: 'Новое входящее письмо', icon: 'Mail', color: 'red', isTrigger: true, isMailbox: true, fields: [{key:'mailbox', label:'Почтовый ящик', placeholder:'Выберите почту', type:'mailbox'}] },
    // Действия
    { id: 'http_request', category: 'Действия', name: 'HTTP Запрос', subtitle: 'Отправка запроса', icon: 'Globe', color: 'indigo', fields: [{key:'method', label:'Метод', placeholder:'GET'}, {key:'url', label:'URL', placeholder:'https://api.example.com'}] },
    { id: 'code', category: 'Действия', name: 'Код', subtitle: 'Выполнить JavaScript', icon: 'Code', color: 'gray', fields: [{key:'code', label:'Код', placeholder:'// ваш JS-код', multiline: true}] },
    { id: 'google_sheets', category: 'Действия', name: 'Google Sheets', subtitle: 'Добавить строку', icon: 'Sheet', color: 'green', fields: [{key:'sheetName', label:'Таблица', placeholder:'Название таблицы'}] },
    { id: 'google_drive', category: 'Действия', name: 'Google Drive', subtitle: 'Загрузить файл', icon: 'Drive', color: 'yellow', fields: [{key:'fileName', label:'Имя файла', placeholder:'report.pdf'}] },
    { id: 'airtable', category: 'Действия', name: 'Airtable', subtitle: 'Работа с базой', icon: 'Sheet', color: 'pink', fields: [{key:'baseId', label:'ID базы', placeholder:'appXXXXXXXX'}] },
    { id: 'send_email', category: 'Действия', name: 'Отправить Email', subtitle: 'Письмо получателю', icon: 'Mail', color: 'red', fields: [{key:'to', label:'Кому', placeholder:'client@mail.com'}, {key:'subject', label:'Тема письма', placeholder:'Тема'}] },
    { id: 'telegram_send', category: 'Действия', name: 'Telegram', subtitle: 'Отправить сообщение', icon: 'Send', color: 'blue', fields: [{key:'chatId', label:'ID чата', placeholder:'chat_id'}] },
    // AI — только два блока: агент и оркестратор.
    // Оркестратор привязывается ТОЛЬКО к агентам; агент, у которого уже есть
    // оркестратор, не может быть привязан к другому (логика в конструкторе).
    { id: 'ai_agent', category: 'AI', name: 'AI Agent', subtitle: 'Главный агент с инструментами', icon: 'Robot', color: 'purple', isAI: true, isAgent: true, fields: [] },
    { id: 'orchestrator', category: 'AI', name: 'Оркестратор', subtitle: 'Дирижёр: раздаёт задачи агентам', icon: 'RobotArmy', color: 'indigo', isAI: true, isOrchestrator: true, fields: [] },
];


export const BLOCK_CATEGORIES = ['Триггеры', 'Действия', 'AI'];

export const getBlockDef = (blockId) => BLOCK_LIBRARY.find(b => b.id === blockId);


// ==========================================
// КОШЕЛЁК И ОПЛАТА АГЕНТОВ
// ==========================================
// Сборка агента (по блокам или через чат) — разовая платная услуга:
// это комиссия сервиса за удобный конструктор. Дальше агент, пока
// активен, ежедневно расходует токены моделей — эту сумму (уже
// с нашей наценкой 30%) мы автоматически списываем с кошелька.
export const AGENT_BILLING_INTERVAL_MS = 24 * 60 * 60 * 1000; // раз в сутки

export const AGENT_SERVICE_MARGIN = 0.3; // наша комиссия поверх стоимости токенов


// Разовая стоимость сборки — зависит от сложности схемы: сколько блоков,
// особенно AI-блоков (они дороже, т.к. используют модели), и сколько связей.
export const calculateAgentPrice = (nodes, edges) => {
    const BASE_PRICE = 299;
    const AI_BLOCK_PRICE = 149;
    const REGULAR_BLOCK_PRICE = 49;
    const EDGE_PRICE = 15;
    let price = BASE_PRICE;
    (nodes || []).forEach((n, i) => {
        const block = getBlockDef(n.blockId);
        if (!block) return;
        if (block.isAI) price += AI_BLOCK_PRICE;
        else if (i > 0) price += REGULAR_BLOCK_PRICE;
    });
    price += (edges || []).length * EDGE_PRICE;
    return Math.round(price / 10) * 10;
};


// Ориентировочный ежедневный расход токенов агента, в рублях,
// уже с учётом нашей комиссии — списывается автоматически раз в сутки.
export const calculateAgentDailyCost = (nodes) => {
    const list = nodes || [];
    const aiCount = list.filter(n => getBlockDef(n.blockId)?.isAI).length;
    const otherCount = Math.max(0, list.length - aiCount);
    const rawTokenCost = aiCount * 28 + otherCount * 4;
    return Math.max(10, Math.round(rawTokenCost * (1 + AGENT_SERVICE_MARGIN)));
};


// Размеры карточки блока на канвасе — используются и при расчёте
// положения портов, и при расчёте линий-соединений.
export const AGENT_NODE_W = 232;

export const AGENT_NODE_H = 96;


// Пустой шаблон нового агента — сразу с одним блоком AI Agent в центре,
// чтобы начинающий пользователь видел с чего начать, а не пустой холст.
// isPaid/status появились вместе с системой кошелька: агент создаётся
// как неоплаченный черновик и становится активным только после оплаты.
export const createBlankAgentDraft = () => ({
    id: null,
    name: 'Мой агент',
    nodes: [{
        id: 'n' + Date.now(),
        blockId: 'ai_agent',
        x: 420, y: 200,
        name: 'AI Agent',
        description: 'Главный агент, который обрабатывает запросы',
        config: {}
    }],
    edges: [],
    isPaid: false,
    status: 'draft' // draft (не сохранён) -> unpaid (сохранён, ждёт оплаты) -> active -> suspended
});


// ==========================================
// КОШЕЛЁК И БИЛЛИНГ
// ==========================================
// Разовая плата за сборку агента (и через блоки, и через чат — одинаково).
export const AGENT_BUILD_FEE = 990;

// Ориентировочная стоимость токенов за один тестовый прогон, на блок агента.
export const TOKEN_CHARGE_PER_NODE = 4;

// Наша доля от стоимости токенов (остальное уходит провайдеру модели).
export const PLATFORM_MARGIN_PERCENT = 30;

// Порог, при котором показываем предупреждение о низком балансе.
export const LOW_BALANCE_THRESHOLD = 150;

// ==========================================
// МАГАЗИН АГЕНТОВ
// ==========================================
// Готовые агенты, которых можно купить (в отличие от собранных по блокам).
// Пока доступен один — «Агент-письма». Остальные добавим позже.
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

export const AGENT_STORE_CATEGORIES = [
    { id: 'all', label: 'Все' },
    { id: 'mail', label: 'Почта' },
    { id: 'sales', label: 'Продажи' },
    { id: 'support', label: 'Поддержка' },
    { id: 'data', label: 'Данные' },
];

export const AGENT_STORE = [
    {
        id: 'email_agent',
        category: 'mail',
        name: 'Агент-письма',
        tagline: 'Читает почту и наводит порядок',
        price: 490,
        icon: 'Mail',
        color: 'red',
        needsMailbox: true,
        abilities: [
            'Читает письма на вашей почте',
            'Присылает сводку в удобный мессенджер',
            'Показывает только важные и интересные письма',
            'Спам и мусор отправляет в корзину',
            'Сортирует почту, оставляя только важное',
            'Может отправлять письма за вас',
        ],
        description: 'Агент-письма подключается к вашему почтовому ящику и берёт на себя рутину: разбирает входящие, отсеивает спам, выделяет важное и присылает краткую сводку туда, где вам удобно. При необходимости отвечает и отправляет письма за вас.',
    },
    {
        id: 'support_agent',
        category: 'support',
        name: 'Агент-поддержка',
        tagline: 'Отвечает клиентам в мессенджерах',
        price: 690,
        icon: 'Headset',
        color: 'blue',
        needsMessenger: true,
        abilities: [
            'Отвечает за вас в выбранном мессенджере',
            'Держит вежливый тон и отвечает мгновенно',
            'Отвечает на частые вопросы по вашей базе',
            'Передаёт сложные обращения вам',
            'Работает круглосуточно без выходных',
        ],
        description: 'Агент-поддержка берёт на себя первую линию общения с клиентами в мессенджере: отвечает на типовые вопросы, помогает мгновенно и в любое время суток, а всё, что требует вашего участия, аккуратно передаёт вам. Выберите мессенджер, в котором он будет работать.',
    },
    {
        id: 'sales_agent',
        category: 'sales',
        name: 'Агент-продажи',
        tagline: 'Ведёт лиды и подогревает клиентов',
        price: 890,
        icon: 'TrendingUp',
        color: 'emerald',
        abilities: [
            'Отвечает на заявки и квалифицирует лиды',
            'Напоминает клиентам о себе вовремя',
            'Ведёт клиента до покупки',
            'Собирает контакты в одну таблицу',
        ],
        description: 'Агент-продажи подхватывает входящие заявки, задаёт правильные вопросы, отделяет горячих клиентов от холодных и ведёт их к сделке, не давая лидам остыть. Все контакты аккуратно складываются в одном месте.',
    },
    {
        id: 'data_agent',
        category: 'data',
        name: 'Агент-аналитик',
        tagline: 'Собирает данные и делает сводки',
        price: 790,
        icon: 'BarChart',
        color: 'amber',
        abilities: [
            'Собирает данные из ваших источников',
            'Строит понятные сводки и отчёты',
            'Присылает регулярную аналитику',
            'Замечает аномалии и предупреждает',
        ],
        description: 'Агент-аналитик собирает данные из ваших источников, приводит их в порядок и превращает в понятные регулярные сводки. Замечает необычные изменения и вовремя предупреждает о них.',
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
        price: 2990,
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

// ==========================================
// ПРОФЕССИИ И ПРЕСЕТЫ АГЕНТОВ (для Cockpit)
// ==========================================
// Любой агент может стать любой профессией. У каждой профессии свой набор
// пресетов-действий (тумблеры) — можно включить несколько сразу. Никакого
// ручного ввода промптов: клик по пресету включает/выключает задачу.
export const AGENT_PROFESSIONS = [
    {
        id: 'mail', name: 'Почта', icon: 'Mail', color: '#ef4444',
        presets: [
            { id: 'sort', label: 'Сортировка писем' },
            { id: 'summary_tg', label: 'Сводка в Telegram' },
            { id: 'antispam', label: 'Фильтр спама' },
            { id: 'autoreply', label: 'Автоответы' },
        ],
    },
    {
        id: 'sales', name: 'Продажи', icon: 'TrendingUp', color: '#22c55e',
        presets: [
            { id: 'leads', label: 'Обработка лидов' },
            { id: 'followup', label: 'Напоминания клиентам' },
            { id: 'crm', label: 'Запись в таблицу' },
        ],
    },
    {
        id: 'support', name: 'Поддержка', icon: 'Headset', color: '#3b82f6',
        presets: [
            { id: 'faq', label: 'Ответы на частые вопросы' },
            { id: 'triage', label: 'Передача сложного вам' },
            { id: 'nps', label: 'Сбор отзывов' },
        ],
    },
    {
        id: 'data', name: 'Данные', icon: 'BarChart', color: '#f59e0b',
        presets: [
            { id: 'collect', label: 'Сбор данных' },
            { id: 'report', label: 'Регулярный отчёт' },
            { id: 'anomaly', label: 'Оповещение об аномалиях' },
        ],
    },
];

export const getProfession = (id) => AGENT_PROFESSIONS.find(p => p.id === id);
// Понятная подпись статуса по включённым пресетам профессии
export const professionStatusLabel = (professionId, activePresets = []) => {
    const prof = getProfession(professionId);
    if (!prof || activePresets.length === 0) return 'Ожидает задачи';
    const first = prof.presets.find(p => activePresets.includes(p.id));
    if (!first) return 'Ожидает задачи';
    return activePresets.length > 1 ? `${first.label} +${activePresets.length - 1}` : first.label;
};
