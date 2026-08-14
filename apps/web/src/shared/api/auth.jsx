import { apiFetch, setToken, clearToken } from '@/shared/api/client';

// Регистрация нового пользователя на сервере. Бросает ApiError, если
// пользователь с таким email уже существует (обрабатывается вызывающим кодом).
// name/phone — задача 9: собираются на форме регистрации, опциональны на
// уровне API (см. RegisterDto на бэкенде).
export async function registerAccount(email, password, name, phone) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: { email, password, name, phone },
    auth: false,
  });
  setToken(data.accessToken);
  return data;
}

// Вход существующего пользователя. Бросает ApiError при неверном email/пароле.
export async function loginAccount(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  setToken(data.accessToken);
  return data;
}

export function logoutAccount() {
  clearToken();
}

// Профиль текущего пользователя с сервера — источник истины для имени и
// телефона (переживает смену браузера/устройства, в отличие от локального
// savedAccounts/accountData в state). См. GET /users/me на бэкенде.
export async function fetchCurrentUser() {
  return apiFetch('/users/me', { method: 'GET' });
}

export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}
