import { apiFetch } from '@/shared/api/client';

// Backend сейчас всегда отвечает через один настроенный провайдер (Groq,
// модель llama-3.3-70b-versatile — см. GroqProvider на сервере). Поле model
// в DTO обязательно, но backend его сейчас не использует для выбора
// провайдера — прокидываем как есть, для истории/логов на будущее.
export async function createBackendChat() {
  const data = await apiFetch('/chats', { method: 'POST' });
  return data.id;
}

export async function sendBackendMessage(chatId, content, model, systemPrompt) {
  const data = await apiFetch(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: { content, model: model || 'llama-3.3-70b-versatile', systemPrompt },
  });
  return data.content;
}
