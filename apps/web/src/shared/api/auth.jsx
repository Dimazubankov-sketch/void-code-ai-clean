import { apiFetch, setToken, clearToken } from '@/shared/api/client';

// Регистрация нового пользователя на сервере. Бросает ApiError, если
// пользователь с таким email уже существует (обрабатывается вызывающим кодом).
export async function registerAccount(email, password) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: { email, password },
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

export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}
