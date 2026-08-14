

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
    'chatSessions', 'activeChatId', 'selectedModelId', 'reasoningByModel', 'lang', 'voiceLang', 'voiceURI', 'voiceRate', 'voicePitch', 'voicePreset', 'ttsProvider', 'voicePresetFish',
    'generatedImages', 'generatedDocuments', 'aiAgents', 'activeAgentId',
    'walletBalance', 'walletTransactions',
    'projects', 'connectedPlugins', 'activeSkills', 'customSkills',
    'orchestratorThreads', 'orchestratorReports', 'agentThreads', 'inbox', 'notifyUpdates', 'notifyPersonal', 'readUpdateIds', 'readPersonalIds',
    'starredIds', 'savedAccounts', 'mailComposeDraft', 'accountPhotos', 'accountData'
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


// ==========================================
// Облегчённая версия состояния — без тяжёлых base64 data-URL картинок
// ==========================================
// Баг: сгенерированные ИИ изображения (и вложения-фото) хранятся как
// data:image/...;base64 прямо в chatSessions[].messages[]. Когда их
// накапливается достаточно, localStorage.setItem начинает падать с
// QuotaExceededError (лимит браузера ~5-10МБ на домен). Раньше это
// молча ловилось в catch — ЛЮБОЕ сохранение после этого момента
// пропадало целиком, включая новые текстовые сообщения. Из-за этого
// пользователь видел: открыл чат заново — ответ ИИ с картинкой исчез,
// осталось только своё сообщение (последнее, что реально сохранилось
// ДО переполнения). Теперь при переполнении вырезаем только тяжёлые
// data-URL картинки (заменяя на null + флаг imageUnavailable), а сам
// текст переписки сохраняется всегда — картинку в худшем случае просто
// не увидим при следующем визите, но диалог не потеряется.
const stripHeavyImageData = (toSave) => {
    const shrinkMessage = (m) => {
        if (!m || typeof m !== 'object') return m;
        let changed = false;
        const next = { ...m };
        if (typeof next.generatedImage === 'string' && next.generatedImage.startsWith('data:')) {
            next.generatedImage = null;
            next.imageUnavailable = true;
            changed = true;
        }
        if (typeof next.image === 'string' && next.image.startsWith('data:')) {
            next.image = null;
            changed = true;
        }
        if (Array.isArray(next.images) && next.images.some(img => typeof img === 'string' && img.startsWith('data:'))) {
            next.images = next.images.filter(img => !(typeof img === 'string' && img.startsWith('data:')));
            changed = true;
        }
        return changed ? next : m;
    };
    return {
        ...toSave,
        chatSessions: (toSave.chatSessions || []).map(session => ({
            ...session,
            messages: (session.messages || []).map(shrinkMessage),
        })),
        // Галерея сгенерированных картинок — тоже часто заполнена base64 и
        // не критична для сохранения самой переписки.
        generatedImages: (toSave.generatedImages || []).filter(img => !(typeof img?.url === 'string' && img.url.startsWith('data:'))),
    };
};

export const savePersistedState = (state) => {
    const toSave = {};
    PERSISTED_KEYS.forEach(key => { toSave[key] = state[key]; });
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.warn('Не удалось сохранить сессию, пробую без тяжёлых картинок:', e);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyImageData(toSave)));
        } catch (e2) {
            // Даже облегчённая версия не влезла — сдаёмся, но хотя бы не
            // роняем приложение.
            console.warn('Не удалось сохранить сессию даже в облегчённом виде:', e2);
        }
    }
};
