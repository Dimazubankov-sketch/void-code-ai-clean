// ==========================================
// АККАУНТЫ Void Ops — вход, переключение, изоляция данных
// ==========================================
// У каждого аккаунта своя история: чаты, проекты, кошелёк, агенты, почта и т.д.
// Гость (без входа) видит чистый интерфейс. При входе/переключении данные
// текущего аккаунта сохраняются в accountData[email], а данные целевого
// аккаунта загружаются на их место.

import { registerAccount, loginAccount, logoutAccount as clearBackendToken, fetchCurrentUser } from '@/shared/api/auth';
import { generateUniqueAgentName } from '@/shared/lib/agent-naming';

export const DOMAIN = '@voidops.ru';

// Поля, которые принадлежат конкретному аккаунту (его личная история).
// Всё, чего здесь нет (тема, настройки интерфейса и т.п.) — общее для устройства.
export const PER_ACCOUNT_FIELDS = [
    'chatSessions', 'activeChatId', 'generatedImages', 'generatedDocuments',
    'aiAgents', 'walletBalance', 'walletTransactions',
    'projects', 'connectedPlugins',
    'inbox', 'readUpdateIds', 'readPersonalIds', 'starredIds',
    'orchestratorThreads', 'orchestratorReports', 'agentThreads',
    'dailyUsage', 'weeklyUsage', 'dailyLimitExceededAt', 'giftModalShown',
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
    projects: [],
    connectedPlugins: [],
    inbox: { updates: [], personal: [], sent: [], drafts: [], trash: [] },
    readUpdateIds: [],
    readPersonalIds: [],
    starredIds: [],
    orchestratorThreads: {},
    agentThreads: {},
    orchestratorReports: {},
    dailyUsage: 0,
    weeklyUsage: 0,
    dailyLimitExceededAt: null,
    giftModalShown: false,
});

// Приветственные письма для нового аккаунта, чтобы почта не была совсем пустой.
// giftAgentName передаётся, если аккаунту только что подарили первого агента —
// тогда добавляется отдельное письмо про подарок.
const welcomeInbox = (giftAgentName = null) => ({
    updates: [
        { id: 'upd_cockpit', title: 'Новинка: Cockpit', body: 'Панель управления агентами и оркестраторами. Ставьте задачи оркестратору — он раздаёт их агентам с вашего подтверждения.', at: Date.now() },
    ],
    personal: [
        { id: 'pm_welcome', from: 'team@voidops.ru', subject: 'Добро пожаловать в Void Code AI', preview: 'Спасибо, что присоединились к закрытому тесту. Здесь появятся письма от внешних компаний и пользователей.', at: Date.now() },
        ...(giftAgentName ? [{
            id: 'pm_gift_agent',
            from: 'team@voidops.ru',
            subject: '🎁 Ваш первый агент — подарок от нас',
            preview: `Мы подарили вам агента «${giftAgentName}» — он уже ждёт вас в Cockpit. Загляните туда, чтобы включить ему задачи и подключить коннекторы.`,
            at: Date.now(),
        }] : []),
    ],
    sent: [], drafts: [], trash: [],
});

// Бесплатный агент-подарок, который выдаётся один раз — сразу после
// регистрации нового аккаунта. Помечен isGift: true (служебный признак —
// в Cockpit статус агента при этом обычный, без постоянной плашки).
// claimed: false — агент появляется в списке Cockpit только после того,
// как пользователь заберёт его через приветственное окошко (см.
// CockpitView → GiftAgentModal); до этого момента он существует в данных,
// но скрыт из общего списка.
const createGiftAgent = () => {
    const now = Date.now();
    return {
        id: `agent_${now}`,
        name: generateUniqueAgentName([]),
        kind: 'worker',
        storeId: 'universal_agent',
        activePresets: [],
        color: '#5b32d4',
        nodes: [], edges: [], isPaid: true, isGift: true, claimed: false, status: 'active',
        mailboxes: [], mailbox: null, messenger: null,
        createdAt: now, updatedAt: now,
    };
};

// Собрать срез данных текущего аккаунта из состояния
const extractAccountData = (state) => {
    const slice = {};
    PER_ACCOUNT_FIELDS.forEach(f => { slice[f] = state[f]; });
    return slice;
};

// Вход/регистрация теперь идёт ЧЕРЕЗ РЕАЛЬНЫЙ БЭКЕНД (Postgres + bcrypt +
// JWT) — пароль проверяется на сервере, а не принимается как есть. При
// успехе backend возвращает JWT-токен (его сохраняет registerAccount/
// loginAccount в localStorage), а локальная история чатов/проектов и т.п.
// по-прежнему хранится по аккаунтам в браузере, как и раньше.
// Бросает ApiError (см. shared/api/client.jsx) при неверном пароле, уже
// занятом email и т.п. — вызывающий код (AuthModal) должен её ловить.
export const applyAccountLogin = async (state, updateState, { username, password, isNewAccount, name, phone }) => {
    const fullEmail = `${username.trim().toLowerCase()}${DOMAIN}`;
    const key = fullEmail;

    if (isNewAccount) {
        await registerAccount(fullEmail, password, name, phone);
    } else {
        await loginAccount(fullEmail, password);
    }

    // Профиль с бэкенда — источник истины для имени/телефона. Если запрос
    // не удался (например, сеть моргнула сразу после успешной
    // регистрации/входа) — не блокируем вход, остаёмся с тем, что ввёл
    // пользователь на форме (для входа в существующий аккаунт телефон в
    // этом случае останется пустым до следующего успешного /users/me).
    let profileName = isNewAccount ? ((name && name.trim()) || username) : username;
    let profilePhone = isNewAccount ? (phone || '') : '';
    try {
        const profile = await fetchCurrentUser();
        if (profile?.name) profileName = profile.name;
        if (profile?.phone) profilePhone = profile.phone;
    } catch {
        // См. комментарий выше — не критично.
    }

    const accountPlans = state.accountPlans || {};
    const plan = isNewAccount ? 'free' : (accountPlans[key] || 'free');
    const savedAccounts = state.savedAccounts || [];
    const existingAccount = savedAccounts.find(a => a.email === fullEmail);
    const exists = !!existingAccount;
    // Дата рождения бэкендом не хранится (см. ProfileEditView) — переживает
    // только смену аккаунта НА ЭТОМ устройстве через savedAccounts, как и
    // accountPhotos. При регистрации нового аккаунта её ещё не может быть.
    const birthDate = isNewAccount ? undefined : existingAccount?.birthDate;
    const nextAccounts = exists
        ? savedAccounts.map(a => a.email === fullEmail ? { ...a, plan, name: profileName, phone: profilePhone } : a)
        : [...savedAccounts, { email: fullEmail, name: profileName, plan, phone: profilePhone }];

    // Сохраняем данные того аккаунта, из которого выходим (если был вход)
    const accountData = { ...(state.accountData || {}) };
    if (state.user) accountData[state.user.email] = extractAccountData(state);

    // Данные целевого аккаунта: для НОВОЙ backend-регистрации — всегда
    // чистые данные с подарком (игнорируем локальный кэш устройства, даже
    // если раньше на этом телефоне/браузере уже был локальный черновик под
    // этим же email — бэкенд только что создал аккаунт заново). Для входа
    // в существующий аккаунт — берём сохранённые локально данные, если есть.
    let targetData = isNewAccount ? null : accountData[fullEmail];
    if (!targetData) {
        targetData = emptyAccountData();
        if (isNewAccount) {
            const giftAgent = createGiftAgent();
            targetData.aiAgents = [giftAgent];
            targetData.inbox = welcomeInbox(giftAgent.name);
        } else {
            targetData.inbox = welcomeInbox();
        }
    }

    updateState({
        user: { name: profileName, email: fullEmail, phone: profilePhone || undefined, birthDate: birthDate || undefined },
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

    // Быстрое переключение без пароля — локальный токен относится к
    // предыдущему пользователю, поэтому сбрасываем его. Реальный ИИ-чат
    // потребует повторного входа с паролем для этого аккаунта.
    clearBackendToken();

    updateState({
        user: { name: account.name, email: account.email, phone: account.phone || undefined, birthDate: account.birthDate || undefined },
        userPlan: accountPlans[email] || account.plan || 'free',
        accountData,
        ...targetData,
    });
};

// Выход из аккаунта — гость видит чистый интерфейс
export const logoutAccount = (state, updateState) => {
    const accountData = { ...(state.accountData || {}) };
    if (state.user) accountData[state.user.email] = extractAccountData(state);
    clearBackendToken();
    updateState({
        user: null,
        userPlan: 'free',
        accountData,
        ...emptyAccountData(),
    });
};
