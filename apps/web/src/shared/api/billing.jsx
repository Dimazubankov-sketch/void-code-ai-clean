import { apiFetch } from '@/shared/api/client';

// ==========================================
// Подписки / оплата через ЮKassa
// ==========================================
// Оплата идёт на стороне ЮKassa: сервер создаёт платёж и возвращает
// confirmationUrl (страница оплаты), фронт туда перенаправляет. После
// оплаты ЮKassa возвращает пользователя на APP_URL/?payment=return, где
// App.jsx опрашивает статус и активирует подписку. Карту наш фронт не
// собирает и не отправляет.

// id тарифа во фронте → enum Plan на бэкенде.
const PLAN_MAP = { free: 'FREE', plus: 'PLUS', pro: 'PRO', pro_plus: 'ULTRA', ultra: 'ULTRA' };

// Создать платёж. Возвращает { paymentId, confirmationUrl, status }.
export async function createBackendPayment(planId, cycle) {
    const plan = PLAN_MAP[String(planId).toLowerCase()] || String(planId).toUpperCase();
    return apiFetch('/billing/subscribe', {
        method: 'POST',
        body: { plan, cycle: String(cycle).toUpperCase() },
    });
}

// Обратная совместимость (старое имя).
export const subscribeBackend = createBackendPayment;

// Статус платежа: { status, plan? }. status==='succeeded' → подписка активирована.
export async function fetchPaymentStatus(paymentId) {
    return apiFetch(`/billing/payment/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}
