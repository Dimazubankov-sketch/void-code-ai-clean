import { apiFetch } from '@/shared/api/client';

// ==========================================
// Клиент почты (Void Mail — реальный backend, папки в БД + Resend)
// ==========================================
// Все вызовы требуют авторизации (JWT подставляется apiFetch
// автоматически). Папка задаётся человекочитаемой строкой в URL:
// 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' (см. mail-store.service.ts
// на бэкенде — там же лежит маппинг на значения enum в БД).

// Личный адрес текущего пользователя (username@voidops.ru) — для шапки
// почты и экрана составления письма.
export async function fetchMailAddress() {
  return apiFetch('/mail/me', { method: 'GET' });
}

// Список писем в папке (только заголовки/превью).
export async function fetchFolder(folder) {
  return apiFetch(`/mail/folder/${folder}`, { method: 'GET' });
}

// Полный текст письма по id. Открытие письма из «Входящих» на бэкенде
// автоматически отмечает его прочитанным.
export async function fetchMailMessage(id) {
  return apiFetch(`/mail/messages/${id}`, { method: 'GET' });
}

// Отметить прочитанным/непрочитанным вручную (например, "отметить
// непрочитанным обратно" из контекстного меню письма).
export async function setMailRead(id, isRead) {
  return apiFetch(`/mail/messages/${id}/read`, { method: 'PATCH', body: { isRead } });
}

// Удаление: письмо из обычной папки уезжает в Корзину; письмо, уже
// лежащее в Корзине (или черновик), удаляется окончательно — решение
// принимает бэкенд, здесь просто дёргаем один и тот же эндпоинт.
export async function deleteMailMessage(id) {
  return apiFetch(`/mail/messages/${id}`, { method: 'DELETE' });
}

// Черновики: создание и обновление — раздельные вызовы, чтобы у
// черновика был стабильный id с первого сохранения (нужно для
// «Сохранить» → «Отправить позже» без создания дублей).
export async function createDraft({ to, subject, body }) {
  return apiFetch('/mail/drafts', { method: 'POST', body: { to, subject, body } });
}

export async function updateDraft(id, { to, subject, body }) {
  return apiFetch(`/mail/drafts/${id}`, { method: 'PATCH', body: { to, subject, body } });
}

// Отправка письма с личного ящика пользователя (@voidops.ru).
// replyToId — заполняется при ответе на письмо (кнопка «Ответить»).
// draftId — заполняется, если письмо отправляется из уже открытого
// черновика (тогда backend не оставляет сиротой запись в «Черновиках»,
// а превращает её в «Отправленные»).
export async function sendMail(to, subject, body, { replyToId, draftId } = {}) {
  return apiFetch('/mail/send', {
    method: 'POST',
    body: { to, subject, body, replyToId, draftId },
  });
}
