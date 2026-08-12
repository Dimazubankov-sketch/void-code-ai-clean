import { apiFetch } from '@/shared/api/client';

// ==========================================
// Клиент почты (реальный backend — Migadu SMTP/IMAP через наш сервер)
// ==========================================
// Все три вызова требуют авторизации (JWT уже подставляется apiFetch
// автоматически). Сервер сам решает, каким ящиком пользоваться — адрес и
// пароль ящика на клиент никогда не передаются и не хранятся.

// Список входящих (только заголовки — тема/отправитель/дата/непрочитано).
// Полный текст письма НЕ приходит в списке (дорого при большом инбоксе),
// подгружается отдельно через fetchMailMessage при открытии письма.
export async function fetchInbox() {
  return apiFetch('/mail/inbox', { method: 'GET' });
}

// Полное тело письма по uid — вызывается лениво при открытии письма.
export async function fetchMailMessage(uid) {
  return apiFetch(`/mail/messages/${uid}`, { method: 'GET' });
}

// Отправка письма с личного ящика пользователя (@voidops.ru).
export async function sendMail(to, subject, body) {
  return apiFetch('/mail/send', {
    method: 'POST',
    body: { to, subject, body },
  });
}
