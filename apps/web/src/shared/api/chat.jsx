import { apiFetch, ApiError, getToken } from '@/shared/api/client';

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

// ==========================================
// Голосовой режим: потоковый ответ по предложениям (SSE)
// ==========================================
// Обычный sendBackendMessage ждёт ответ целиком. Здесь бэкенд присылает
// КАЖДОЕ законченное предложение отдельным событием, и вызывающий код
// (Voice Mode) сразу ставит его в очередь озвучки — пользователь слышит
// начало ответа, пока модель ещё дописывает остальное.
//
// EventSource не используем: он умеет только GET и не даёт передать
// заголовок Authorization. Поэтому обычный fetch + ручной разбор SSE.
export async function streamVoiceMessage(chatId, content, { onSentence, signal, persona, image } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api/v1/chats/${chatId}/voice-stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, persona, image }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'Не удалось связаться с сервером.');
  }
  if (!response.ok || !response.body) {
    throw new ApiError(response.status, `Ошибка сервера (HTTP ${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let serverError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // События SSE разделены пустой строкой.
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      const lines = part.split('\n');
      let event = 'message';
      let dataRaw = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
      }
      if (!dataRaw) continue; // heartbeat-комментарий ': keep-alive'
      let data;
      try { data = JSON.parse(dataRaw); } catch { continue; }
      if (event === 'sentence' && data.text) { full += (full ? ' ' : '') + data.text; onSentence?.(data.text); }
      else if (event === 'done') { if (data.full) full = data.full; }
      else if (event === 'error') { serverError = new ApiError(data.statusCode || 500, data.message || 'Ошибка'); }
    }
  }

  if (serverError) throw serverError;
  return full;
}

// Генерация изображения через backend (DALL-E 3). Возвращает URL/ data-URL.
// images — опциональные референсные фото (data-URL base64) для режима
// Image-to-Image, когда пользователь прикрепил фото вместе с промптом
// в «Генерации изображений» (до 4 штук).
export async function generateBackendImage(prompt, images = []) {
  const data = await apiFetch('/images/generate', {
    method: 'POST',
    body: { prompt, ...(images && images.length ? { images } : {}) },
  });
  return data.url;
}

// ==========================================
// Генерация видео (OpenRouter Grok Imagine Video / 1.5) — задача 6
// ==========================================
// Асинхронно: submit сразу возвращает jobId (без ожидания результата —
// сама генерация занимает от ~30с до нескольких минут), дальше клиент
// сам опрашивает status по интервалу. Ни один отдельный запрос не
// держится долго, поэтому таймауты прокси/Cloudflare не грозят.
export async function submitBackendVideo({ prompt, model, aspectRatio, duration, resolution, imageUrl }) {
  const data = await apiFetch('/videos/generate', {
    method: 'POST',
    body: { prompt, model, aspectRatio, duration, resolution, ...(imageUrl ? { imageUrl } : {}) },
  });
  return data; // { jobId, pollingUrl }
}

export async function pollBackendVideo(jobId) {
  const data = await apiFetch(`/videos/status/${encodeURIComponent(jobId)}`, { method: 'GET' });
  return data; // { status, url, error, cost }
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

// ==========================================
// ИИ-техподдержка (Void Mini, жёсткий системный промпт на сервере)
// ==========================================
// Отдельный эндпоинт: не создаёт ChatSession и не расходует дневной/
// недельный лимит запросов — см. SupportController на бэкенде.
// history — [{role:'user'|'assistant', content}], без системного
// сообщения (оно всегда фиксировано сервером).
export async function sendSupportMessage(message, history = [], images = []) {
  const data = await apiFetch('/support/message', {
    method: 'POST',
    body: { message, history, ...(images && images.length ? { images } : {}) },
  });
  return data.content;
}
