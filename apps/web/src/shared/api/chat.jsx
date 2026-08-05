import { apiFetch } from '@/shared/api/client';

// Backend сейчас всегда отвечает через один настроенный провайдер (Groq,
// модель llama-3.3-70b-versatile — см. GroqProvider на сервере). Поле model
// в DTO обязательно, но backend его сейчас не использует для выбора
// провайдера — прокидываем как есть, для истории/логов на будущее.
export async function createBackendChat() {
  const data = await apiFetch('/chats', { method: 'POST' });
  return data.id;
}

export async function sendBackendMessage(chatId, content, model, systemPrompt, images = []) {
  const data = await apiFetch(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: { content, model: model || 'llama-3.3-70b-versatile', systemPrompt, images },
  });
  return data.content;
}

// Генерация изображения через backend (DALL-E 3). Возвращает URL/ data-URL.
export async function generateBackendImage(prompt) {
  const data = await apiFetch('/images/generate', {
    method: 'POST',
    body: { prompt },
  });
  return data.url;
}

// Извлекает основной текст с указанной страницы через бэкенд, чтобы
// подмешать его в запрос к LLM. Возвращает { url, title, text, truncated }
// или бросает исключение при ошибке (нет доступа, неподдерживаемый формат).
// См. WebFetchService на сервере (SSRF-защита, лимиты по байтам и по
// длине итогового текста).
export async function fetchWebPage(url) {
  return apiFetch('/webfetch/read', { method: 'POST', body: { url } });
}

// Использование дневных лимитов картинок: сколько израсходовано,
// какой лимит и сколько осталось. Мягко фолбэчит на нули при ошибке.
export async function fetchImageUsage() {
  try {
    return await apiFetch('/images/usage', { method: 'POST' });
  } catch {
    return { used: 0, limit: 0, remaining: 0 };
  }
}

// То же самое для TTS — количество СИМВОЛОВ за сутки.
export async function fetchTtsUsage() {
  try {
    return await apiFetch('/tts/usage', { method: 'POST' });
  } catch {
    return { used: 0, limit: 0, remaining: 0 };
  }
}
