import { useCallback, useRef, useState } from 'react';
import { apiFetchBlob, ApiError } from '@/shared/api/client';

// ==========================================
// useVoiceModeSpeech — озвучка ответа Сары по фразам, с упреждением
// ==========================================
// Отдельно от useOpenAiTts (тот озвучивает сообщение в чате целиком по
// кнопке и намеренно не трогается — он в проде и работает). Здесь другая
// задача: минимальная задержка до ПЕРВОГО звука в разговоре.
//
// Почему это вообще ускоряет: бэкенд-чат отдаёт ответ LLM целиком, не
// потоково (см. sendBackendMessage в App.jsx) — этого мы отсюда не
// изменим. Но синтез речи занимает время, пропорциональное длине текста:
// озвучить абзац на 800 символов заметно дольше, чем первое предложение
// на 70. Поэтому режем готовый ответ на фразы, синтезируем и запускаем
// ПЕРВУЮ сразу, а остальные подгружаем фоном, пока играет предыдущая —
// пользователь слышит ответ почти сразу, без паузы между фразами.
//
// Второе назначение хука — надёжное воспроизведение (жалоба «не удалось
// воспроизвести аудио», после которой разговор не возобновить): вместо
// нового new Audio() на каждый ответ используется ОДИН <audio>-элемент,
// «разблокированный» жестом пользователя при входе в режим (см. unlock).
// Браузеры разрешают дальнейшие программные play() именно на том
// элементе, который уже играл по жесту — это и есть штатный способ жить
// с autoplay-политикой.

const MAX_CHARS_PER_CHUNK = 260;
// Первый кусок намеренно короче остальных — он определяет задержку до
// первого звука, а всё, что идёт следом, всё равно подгружается фоном.
const MAX_CHARS_FIRST_CHUNK = 110;

// Готовим текст к произнесению: markdown-разметка, ссылки и блоки кода
// в речи звучат мусором, поэтому вычищаем их.
function sanitizeForSpeech(raw) {
    return String(raw || '')
        .replace(/```[\s\S]*?```/g, ' ')      // блоки кода целиком
        .replace(/`([^`]+)`/g, '$1')          // инлайн-код
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')// картинки
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // ссылки → только текст
        .replace(/^#{1,6}\s+/gm, '')          // заголовки
        .replace(/[*_~>|]/g, ' ')             // прочая разметка
        .replace(/\s+/g, ' ')
        .trim();
}

// Режем на куски по границам предложений, не разрывая слова.
export function splitIntoSpeechChunks(text) {
    const clean = sanitizeForSpeech(text);
    if (!clean) return [];
    // Разбиваем на предложения, сохраняя знаки препинания.
    const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
    const chunks = [];
    let buf = '';
    for (const s of sentences) {
        const limit = chunks.length === 0 ? MAX_CHARS_FIRST_CHUNK : MAX_CHARS_PER_CHUNK;
        if (buf && (buf.length + s.length) > limit) {
            chunks.push(buf.trim());
            buf = s;
        } else {
            buf += s;
        }
        // Одно предложение длиннее лимита — режем по словам, чтобы не
        // отправлять на синтез простыню и не ждать её целиком.
        while (buf.length > MAX_CHARS_PER_CHUNK) {
            const cut = buf.lastIndexOf(' ', MAX_CHARS_PER_CHUNK);
            const at = cut > 40 ? cut : MAX_CHARS_PER_CHUNK;
            chunks.push(buf.slice(0, at).trim());
            buf = buf.slice(at);
        }
    }
    if (buf.trim()) chunks.push(buf.trim());
    return chunks.filter(Boolean);
}

export function useVoiceModeSpeech() {
    const [speaking, setSpeaking] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [limitExceeded, setLimitExceeded] = useState(false);

    const audioRef = useRef(null);        // единственный переиспользуемый <audio>
    const runIdRef = useRef(0);           // «поколение» запуска — защита от гонок
    const abortRef = useRef(null);        // отмена незавершённых fetch'ей
    const urlsRef = useRef([]);           // созданные object URL — чистим за собой

    const ensureAudioEl = useCallback(() => {
        if (!audioRef.current) {
            const el = new Audio();
            el.preload = 'auto';
            audioRef.current = el;
        }
        return audioRef.current;
    }, []);

    // Вызывается СИНХРОННО внутри клика по кнопке Voice Mode: проигрываем
    // на общем элементе пустышку, чтобы браузер пометил его как
    // «разрешённый пользователем». Дальше все ответы Сары играют на этом
    // же элементе и уже не упираются в autoplay-политику.
    const unlock = useCallback(() => {
        const el = ensureAudioEl();
        try {
            el.muted = true;
            el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
            const p = el.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => { /* не критично: просто не удалось прогреть */ });
            }
            // Снимаем mute сразу — элемент уже «активирован» самим фактом
            // play() по жесту, дальше он должен звучать нормально.
            window.setTimeout(() => { try { el.pause(); el.muted = false; } catch { /* noop */ } }, 0);
        } catch { /* noop */ }
    }, [ensureAudioEl]);

    const revokeUrls = useCallback(() => {
        urlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
        urlsRef.current = [];
    }, []);

    const stop = useCallback(() => {
        runIdRef.current += 1; // всё, что было запущено раньше, теперь неактуально
        try { abortRef.current?.abort(); } catch { /* noop */ }
        abortRef.current = null;
        const el = audioRef.current;
        if (el) {
            try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* noop */ }
            el.onended = null;
            el.onerror = null;
        }
        revokeUrls();
        setSpeaking(false);
        setLoading(false);
    }, [revokeUrls]);

    // Синтез одного куска. Возвращает object URL или null при отмене.
    const fetchChunk = useCallback(async (chunk, opts, signal) => {
        const blob = await apiFetchBlob('/tts/synthesize', {
            method: 'POST',
            body: {
                text: chunk,
                provider: opts.provider === 'openai' ? 'openai' : 'fish',
                voice: opts.voice || undefined,
                speed: opts.speed ?? 1.0,
            },
            signal,
        });
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        return url;
    }, []);

    const playUrl = useCallback((url) => new Promise((resolve, reject) => {
        const el = ensureAudioEl();
        el.onended = () => resolve();
        el.onerror = () => reject(new Error('audio-element-error'));
        el.src = url;
        const p = el.play();
        if (p && typeof p.catch === 'function') {
            p.catch((e) => {
                // Прерывание своим же stop()/barge-in — штатная ситуация,
                // не ошибка для пользователя.
                if (e?.name === 'AbortError') { resolve(); return; }
                reject(e);
            });
        }
    }), [ensureAudioEl]);

    // Главный вход: озвучить весь ответ Сары по частям.
    const speak = useCallback(async (text, opts = {}) => {
        const chunks = splitIntoSpeechChunks(text);
        if (!chunks.length) return;

        stop(); // гарантированно снимаем предыдущий ответ
        const myRun = runIdRef.current;
        const controller = new AbortController();
        abortRef.current = controller;

        setError(null);
        setLimitExceeded(false);
        setLoading(true);

        try {
            // Первый кусок — ждём, остальные подгружаем на опережение.
            let currentUrl = await fetchChunk(chunks[0], opts, controller.signal);
            if (runIdRef.current !== myRun) return;
            setLoading(false);
            setSpeaking(true);

            for (let i = 0; i < chunks.length; i++) {
                if (runIdRef.current !== myRun) return;
                // Запускаем загрузку СЛЕДУЮЩЕГО куска, не дожидаясь конца
                // воспроизведения текущего — благодаря этому между фразами
                // нет пауз.
                const nextPromise = (i + 1 < chunks.length)
                    ? fetchChunk(chunks[i + 1], opts, controller.signal).catch(() => null)
                    : null;

                await playUrl(currentUrl);
                if (runIdRef.current !== myRun) return;

                if (nextPromise) {
                    const nextUrl = await nextPromise;
                    if (runIdRef.current !== myRun) return;
                    if (!nextUrl) break; // не смогли синтезировать хвост — заканчиваем тем, что есть
                    currentUrl = nextUrl;
                }
            }
            if (runIdRef.current !== myRun) return;
            setSpeaking(false);
        } catch (e) {
            if (runIdRef.current !== myRun) return;
            setLoading(false);
            setSpeaking(false);
            if (e?.name === 'AbortError') return;
            if (e instanceof ApiError && e.status === 403) {
                setLimitExceeded(true);
                setError(e.message || 'Дневной лимит озвучки исчерпан');
                return;
            }
            // eslint-disable-next-line no-console
            console.warn('[useVoiceModeSpeech] озвучка не удалась:', e?.message || e);
            setError('Не удалось воспроизвести ответ');
        }
    }, [fetchChunk, playUrl, stop]);

    // Явный сброс ошибки — чтобы «залипшая» ошибка не блокировала
    // возобновление разговора (см. жалобу: после неё нельзя начать заново).
    const clearError = useCallback(() => { setError(null); setLimitExceeded(false); }, []);

    return { speak, stop, unlock, clearError, speaking, loading, error, limitExceeded };
}
