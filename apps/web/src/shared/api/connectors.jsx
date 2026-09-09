import { apiFetch } from '@/shared/api/client';

// ==========================================
// Коннекторы (#3) — реальные подключения внешних сервисов
// ==========================================
// Не заглушка: реальные запросы к бэкенду. Telegram и «Звонки» подключаются
// прямо запросом (с данными пользователя), GitHub/Notion — через OAuth-окно
// (бэкенд отдаёт ссылку авторизации, фронт на неё переходит; после согласия
// провайдер редиректит на APP_URL/?connector=<id>&status=ok, где App.jsx
// синхронизирует список). Секреты живут только на сервере.

// Список подключённых коннекторов: [{ provider, status, accountLabel, meta }]
export async function fetchConnectors() {
    return apiFetch('/connectors', { method: 'GET' });
}

export async function disconnectConnector(provider) {
    return apiFetch(`/connectors/${encodeURIComponent(provider)}`, { method: 'DELETE' });
}

// Telegram — по бот-токену из @BotFather.
export async function connectTelegram(botToken) {
    return apiFetch('/connectors/telegram', { method: 'POST', body: { botToken } });
}

// Звонки — привязка номера (Voximplant на сервере).
export async function connectCalls(phone) {
    return apiFetch('/connectors/calls', { method: 'POST', body: { phone } });
}

// GitHub/Notion — получить ссылку авторизации OAuth и перейти по ней.
export async function startGithubOAuth() {
    return apiFetch('/connectors/github/start', { method: 'GET' });
}
export async function startNotionOAuth() {
    return apiFetch('/connectors/notion/start', { method: 'GET' });
}

// Провайдеры, которые подключаются через OAuth-редирект (без ввода данных).
export const OAUTH_CONNECTORS = ['github', 'notion'];
