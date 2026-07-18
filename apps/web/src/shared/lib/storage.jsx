

// ==========================================
// СОХРАНЕНИЕ СЕССИИ (localStorage)
// ==========================================
// Ключ, под которым состояние аккаунта/чатов хранится в браузере.
export const STORAGE_KEY = 'voidcode_session_v1';


// Поля, которые нужно запоминать между визитами/обновлениями страницы.
// Всё, что не попало в этот список (модалки, флаги генерации и т.п.),
// всегда стартует "с чистого листа" — так и должно быть.
export const PERSISTED_KEYS = [
    'user', 'userPlan', 'accountPlans', 'usedDailyLimits', 'usedWeeklyLimits', 'dailyLimitExceededAt', 'isDarkMode', 'notificationsEnabled',
    'chatSessions', 'activeChatId', 'selectedModelId', 'systemPromptState', 'lang',
    'generatedImages', 'generatedDocuments', 'aiAgents', 'activeAgentId',
    'walletBalance', 'walletTransactions',
    'sites', 'activeSiteId', 'sitesCreatedCount', 'sitesCreatedDate',
    'orchestratorThreads', 'orchestratorReports', 'inbox', 'notifyUpdates', 'notifyPersonal', 'readUpdateIds', 'readPersonalIds'
];


export const loadPersistedState = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) {
        // Повреждённые данные в localStorage не должны ломать загрузку сайта
        console.warn('Не удалось прочитать сохранённую сессию:', e);
        return null;
    }
};


export const savePersistedState = (state) => {
    try {
        const toSave = {};
        PERSISTED_KEYS.forEach(key => { toSave[key] = state[key]; });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.warn('Не удалось сохранить сессию:', e);
    }
};
