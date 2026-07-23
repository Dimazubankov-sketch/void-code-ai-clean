// ==========================================
// ШЕРИНГ ДИАЛОГА — кодирование диалога в ссылку
// ==========================================
// Диалог кодируется в URL-хэш (#share=...). При открытии ссылки другой
// пользователь автоматически получает этот диалог как новый чат с полной
// историей и может продолжать его как свой. Работает без сервера, но очень
// длинные диалоги дают длинную ссылку — тогда предлагаем копирование текста.

const MAX_URL_LEN = 8000; // предел длины ссылки, дальше — фолбэк на текст

// Безопасное кодирование UTF-8 → base64 и обратно
const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (str) => decodeURIComponent(escape(atob(str)));

// Оставляем в сообщениях только необходимое, чтобы ссылка была короче
const slimMessages = (messages = []) => messages.map(m => ({
    r: m.role === 'assistant' ? 'a' : 'u',
    c: m.content || '',
    ...(m.generatedImage ? { g: 1 } : {}),
}));

const expandMessages = (slim = []) => slim.map(m => ({
    role: m.r === 'a' ? 'assistant' : 'user',
    content: m.c || '',
}));

// Собрать ссылку на диалог. Возвращает { url, tooLong }
export const buildShareLink = (chat) => {
    const payload = { t: chat?.title || 'Общий чат', m: slimMessages(chat?.messages) };
    const encoded = b64encode(JSON.stringify(payload));
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}#share=${encoded}`;
    return { url, tooLong: url.length > MAX_URL_LEN, encoded };
};

// Прочитать диалог из текущего хэша ссылки (если есть). Возвращает chat|null
export const readSharedFromHash = () => {
    try {
        const hash = window.location.hash || '';
        const match = hash.match(/#share=([^&]+)/);
        if (!match) return null;
        const payload = JSON.parse(b64decode(match[1]));
        return {
            id: Date.now(),
            title: payload.t || 'Общий чат',
            messages: expandMessages(payload.m),
            sharedImport: true,
        };
    } catch {
        return null;
    }
};

// Убрать #share из адресной строки, не перезагружая страницу
export const clearShareHash = () => {
    try {
        const clean = window.location.pathname + window.location.search;
        window.history.replaceState(null, '', clean);
    } catch { /* noop */ }
};

// Текстовый вид диалога — фолбэк, когда ссылка слишком длинная
export const dialogToText = (chat) => {
    const lines = [`# ${chat?.title || 'Диалог'}`, ''];
    (chat?.messages || []).forEach(m => {
        lines.push(m.role === 'assistant' ? 'Void Code AI:' : 'Вы:');
        lines.push(m.content || '');
        lines.push('');
    });
    return lines.join('\n');
};
