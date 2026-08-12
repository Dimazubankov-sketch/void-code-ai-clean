// ==========================================
// БАЗОВЫЙ КЛИЕНТ К РЕАЛЬНОМУ БЭКЕНДУ (NestJS)
// ==========================================
// Запросы идут на ОТНОСИТЕЛЬНЫЙ путь /api/v1/... — то есть на тот же домен,
// с которого отдаётся сам сайт. На сервере nginx проксирует /api/ на
// локальный NestJS-процесс (порт 3000). Благодаря этому не нужен ни
// отдельный поддомен для API, ни настройка CORS — с точки зрения браузера
// это один и тот же origin.

const TOKEN_KEY = 'void_code_access_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Простой класс ошибки, чтобы вызывающий код мог отличить «сервер ответил
// с ошибкой» (например, 401 — истёк токен, или 403 — исчерпан лимит) от
// «сеть недоступна».
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ==========================================
// Глобальная реакция на «сессия истекла» (задача 3)
// ==========================================
// Раньше 401 обрабатывался только в одном месте (отправка сообщения в
// чат, App.jsx) — все остальные запросы (TTS, генерация картинок, и
// теперь почта) при истёкшем токене просто падали с непонятной ошибкой
// в консоли, без единого понятного статуса пользователю. Теперь ЛЮБОЙ
// 401 от бэкенда (через apiFetch ИЛИ apiFetchBlob) централизованно:
// 1) чистит невалидный токен, 2) шлёт единое DOM-событие, на которое
// App.jsx подписывается один раз и показывает экран входа с понятным
// сообщением — независимо от того, какая вкладка/фича вызвала запрос.
const SESSION_EXPIRED_EVENT = 'void-code:session-expired';

function notifySessionExpired() {
  clearToken();
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  } catch { /* noop — например, вызов не в браузерном окружении */ }
}

export function onSessionExpired(handler) {
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
}

export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // fetch кинул исключение до получения ответа — сервер недоступен
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте, что бэкенд запущен.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // тело могло быть пустым — это нормально для некоторых ответов
  }

  if (!response.ok) {
    const message = data?.message || `Ошибка сервера (HTTP ${response.status})`;
    if (response.status === 401 && auth) notifySessionExpired();
    throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message);
  }
  return data;
}

// Как apiFetch, но возвращает Blob — для эндпоинтов, которые отдают
// бинарный контент (audio/mpeg от TTS, image/png от генератора и т.п.).
// Если сервер ответил с ошибкой, парсит JSON-ошибку из тела как обычный apiFetch.
export async function apiFetchBlob(path, { method = 'POST', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером.');
  }

  if (!response.ok) {
    let message = `Ошибка сервера (HTTP ${response.status})`;
    try {
      const err = await response.json();
      if (err?.message) message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    } catch { /* тело не json */ }
    if (response.status === 401 && auth) notifySessionExpired();
    throw new ApiError(response.status, message);
  }
  return await response.blob();
}
