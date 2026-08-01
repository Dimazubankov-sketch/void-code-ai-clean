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
    throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message);
  }
  return data;
}
