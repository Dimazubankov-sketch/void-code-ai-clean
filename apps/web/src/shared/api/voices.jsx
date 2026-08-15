import { apiFetch } from '@/shared/api/client';

// ==========================================
// Пользовательские голоса (клонирование и генерация)
// ==========================================
// Всё, что связано с ключом Fish Audio, проверкой подписки и суточными
// лимитами, живёт на бэкенде — здесь только вызовы. Значения квоты с
// сервера используются исключительно для отрисовки: настоящая проверка
// всё равно происходит при создании.

export async function listUserVoices() {
    return apiFetch('/voices', { method: 'GET' });
}

export async function getVoiceQuota() {
    return apiFetch('/voices/quota', { method: 'GET' });
}

// audio — data-URL записи (audio/webm | audio/wav | audio/mpeg)
export async function cloneVoice(title, audio) {
    return apiFetch('/voices/clone', { method: 'POST', body: { title, audio } });
}

// Предпрослушка: возвращает варианты голоса (WAV в base64), постоянная
// модель ещё не создаётся и дневной лимит не расходуется.
export async function designVoicePreview(instruction, referenceText, language = 'ru') {
    return apiFetch('/voices/design/preview', { method: 'POST', body: { instruction, referenceText, language } });
}

export async function designVoiceSave(title, audioBase64, instruction) {
    return apiFetch('/voices/design/save', { method: 'POST', body: { title, audioBase64, instruction } });
}

export async function deleteUserVoice(id) {
    return apiFetch(`/voices/${id}`, { method: 'DELETE' });
}
