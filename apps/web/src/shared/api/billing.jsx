import { apiFetch } from '@/shared/api/client';

// ==========================================
// Подписки
// ==========================================
// Раньше оформление тарифа меняло ТОЛЬКО локальное состояние, а на
// сервере план пользователя оставался FREE. Из-за этого платные зоны
// (например, создание собственного голоса) не открывались: их проверяет
// бэкенд по user.plan, а не по тому, что нарисовано в интерфейсе.
// Теперь покупка обязательно фиксируется на сервере.

// plan: 'PLUS' | 'PRO' | 'ULTRA', cycle: 'MONTH' | 'YEAR'
export async function subscribeBackend(plan, cycle) {
    return apiFetch('/billing/subscribe', {
        method: 'POST',
        body: { plan: String(plan).toUpperCase(), cycle: String(cycle).toUpperCase() },
    });
}
