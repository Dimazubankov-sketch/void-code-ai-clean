// ==========================================
// АККАУНТЫ Void Ops — вход, переключение, изоляция данных
// ==========================================
// У каждого аккаунта своя история: чаты, кошелёк, агенты, сайты, почта и т.д.
// Гость (без входа) видит чистый интерфейс. При входе/переключении данные
// текущего аккаунта сохраняются в accountData[email], а данные целевого
// аккаунта загружаются на их место.

export const DOMAIN = '@voidops.com';

// Поля, которые принадлежат конкретному аккаунту (его личная история).
// Всё, чего здесь нет (тема, настройки интерфейса и т.п.) — общее для устройства.
export const PER_ACCOUNT_FIELDS = [
    'chatSessions', 'activeChatId', 'generatedImages', 'generatedDocuments',
    'aiAgents', 'walletBalance', 'walletTransactions', 'sites', 'activeSiteId',
    'sitesCreatedCount', 'sitesCreatedDate',
    'inbox', 'readUpdateIds', 'readPersonalIds', 'starredIds',
    'orchestratorThreads', 'orchestratorReports', 'agentThreads',
    'systemPrompt', 'dailyUsage', 'weeklyUsage', 'dailyLimitExceededAt',
];

// Пустая история — то, что видит гость и то, с чего стартует новый аккаунт.
export const emptyAccountData = () => ({
    chatSessions: [],
    activeChatId: null,
    generatedImages: [],
    generatedDocuments: [],
    aiAgents: [],
    walletBalance: 0,
    walletTransactions: [],
    sites: [],
    activeSiteId: null,
    sitesCreatedCount: 0,
    sitesCreatedDate: null,
    inbox: { updates: [], personal: [], sent: [], drafts: [], trash: [] },
    readUpdateIds: [],
    readPersonalIds: [],
    starredIds: [],
    orchestratorThreads: {},
    agentThreads: {},
    orchestratorReports: {},
    systemPrompt: '',
    dailyUsage: 0,
    weeklyUsage: 0,
    dailyLimitExceededAt: null,
});

// Приветственные письма для нового аккаунта, чтобы почта не была совсем пустой
const welcomeInbox = () => ({
    updates: [
        { id: 'upd_cockpit', title: 'Новинка: Cockpit', body: 'Панель управления агентами и оркестраторами. Ставьте задачи оркестратору — он раздаёт их агентам с вашего подтверждения.', at: Date.now() },
    ],
    personal: [
        { id: 'pm_welcome', from: 'team@voidops.com', subject: 'Добро пожаловать в Void Code AI', preview: 'Спасибо, что присоединились к закрытому тесту. Здесь появятся письма от внешних компаний и пользователей.', at: Date.now() },
    ],
    sent: [], drafts: [], trash: [],
});

// Собрать срез данных текущего аккаунта из состояния
const extractAccountData = (state) => {
    const slice = {};
    PER_ACCOUNT_FIELDS.forEach(f => { slice[f] = state[f]; });
    return slice;
};

export const applyAccountLogin = (state, updateState, { username, isNewAccount }) => {
    const fullEmail = `${username.trim().toLowerCase()}${DOMAIN}`;
    const key = fullEmail;
    const accountPlans = state.accountPlans || {};
    const plan = isNewAccount ? 'free' : (accountPlans[key] || 'free');
    const savedAccounts = state.savedAccounts || [];
    const exists = savedAccounts.some(a => a.email === fullEmail);
    const nextAccounts = exists
        ? savedAccounts.map(a => a.email === fullEmail ? { ...a, plan } : a)
        : [...savedAccounts, { email: fullEmail, name: username, plan }];

    // Сохраняем данные того аккаунта, из которого выходим (если был вход)
    const accountData = { ...(state.accountData || {}) };
    if (state.user) accountData[state.user.email] = extractAccountData(state);

    // Данные целевого аккаунта: сохранённые, либо чистые (для нового — с
    // приветственными письмами)
    let targetData = accountData[fullEmail];
    if (!targetData) {
        targetData = emptyAccountData();
        targetData.inbox = welcomeInbox();
    }

    updateState({
        user: { name: username, email: fullEmail },
        userPlan: plan,
        accountPlans: { ...accountPlans, [key]: plan },
        savedAccounts: nextAccounts,
        accountData,
        ...targetData,
        showAuthModal: false,
    });
};

// Переключение на уже сохранённый аккаунт без пароля
export const switchToAccount = (state, updateState, email) => {
    const accountPlans = state.accountPlans || {};
    const account = (state.savedAccounts || []).find(a => a.email === email);
    if (!account) return;

    const accountData = { ...(state.accountData || {}) };
    if (state.user) accountData[state.user.email] = extractAccountData(state);

    let targetData = accountData[email];
    if (!targetData) { targetData = emptyAccountData(); targetData.inbox = welcomeInbox(); }

    updateState({
        user: { name: account.name, email: account.email },
        userPlan: accountPlans[email] || account.plan || 'free',
        accountData,
        ...targetData,
    });
};

// Выход из аккаунта — гость видит чистый интерфейс
export const logoutAccount = (state, updateState) => {
    const accountData = { ...(state.accountData || {}) };
    if (state.user) accountData[state.user.email] = extractAccountData(state);
    updateState({
        user: null,
        userPlan: 'free',
        accountData,
        ...emptyAccountData(),
    });
};
