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
    // Огибающая громкости текущего куска — по ней орб анимируется В ТОН
    // реальной озвучке (см. VoiceModeOrb). Считается ОТДЕЛЬНО от
    // воспроизведения: decodeAudioData работает с копией ArrayBuffer, а не
    // с <audio>-элементом. Подключать анализатор к самому элементу через
    // createMediaElementSource в этом проекте нельзя — уже проверено, что
    // это искажает звук и роняет события ended/timeupdate.
    // Формат: { peaks: Float32Array (0..1), duration: seconds } | null.
    const envelopeRef = useRef(null);
    const decodeCtxRef = useRef(null);
    const runIdRef = useRef(0);           // «поколение» запуска — защита от гонок
    const abortRef = useRef(null);        // отмена незавершённых fetch'ей
    const urlsRef = useRef([]);           // созданные object URL — чистим за собой
    const chunkBlobsRef = useRef(new Map()); // url -> blob, чтобы посчитать огибающую

    // Считает огибающую (пики по ~40мс) из сырых байтов MP3. Вызывается
    // ПОСЛЕ старта воспроизведения и намеренно не ожидается — если декод
    // не успел или не удался, орб просто использует плавный запасной
    // вариант, а скорость отдачи звука не страдает.
    const computeEnvelope = useCallback(async (arrayBuf) => {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!decodeCtxRef.current) decodeCtxRef.current = new AC();
            const audioBuffer = await decodeCtxRef.current.decodeAudioData(arrayBuf);
            const raw = audioBuffer.getChannelData(0);
            const bucket = Math.max(1, Math.floor(audioBuffer.sampleRate * 0.04)); // ~40мс
            const count = Math.ceil(raw.length / bucket);
            const peaks = new Float32Array(count);
            let max = 0.0001;
            for (let i = 0; i < count; i++) {
                let sum = 0;
                const start = i * bucket;
                const end = Math.min(start + bucket, raw.length);
                for (let j = start; j < end; j++) sum += raw[j] * raw[j];
                const rms = Math.sqrt(sum / Math.max(1, end - start));
                peaks[i] = rms;
                if (rms > max) max = rms;
            }
            for (let i = 0; i < count; i++) peaks[i] = peaks[i] / max; // нормализуем 0..1
            envelopeRef.current = { peaks, duration: audioBuffer.duration };
        } catch {
            envelopeRef.current = null;
        }
    }, []);

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

    // Мягкая остановка при перебивании: Сара не обрывается на полуслове
    // мгновенно, а быстро затихает за ~0.9с — на слух это читается как
    // «услышал(а), умолкаю», а не как технический глюк. Дальнейшие куски
    // очереди при этом отменяются сразу (stop ниже), так что «договорить
    // всю мысль» она не пытается — гаснет именно текущая фраза.
    const stopGraceful = useCallback((fadeMs = 900) => {
        const el = audioRef.current;
        // Новые куски не подтягиваем и запросы отменяем немедленно.
        runIdRef.current += 1;
        try { abortRef.current?.abort(); } catch { /* noop */ }
        abortRef.current = null;
        queueRef.current = [];
        streamDoneRef.current = true;
        if (!el || el.paused) { 
            try { el?.pause(); } catch { /* noop */ }
            setSpeaking(false); setLoading(false);
            return;
        }
        const startVol = el.volume;
        const startedAt = Date.now();
        const step = () => {
            const k = Math.min(1, (Date.now() - startedAt) / fadeMs);
            try { el.volume = Math.max(0, startVol * (1 - k)); } catch { /* noop */ }
            if (k < 1) { requestAnimationFrame(step); return; }
            try { el.pause(); el.removeAttribute('src'); el.load(); el.volume = startVol; } catch { /* noop */ }
            revokeUrls();
            chunkBlobsRef.current.clear();
            envelopeRef.current = null;
            setSpeaking(false);
            setLoading(false);
        };
        requestAnimationFrame(step);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revokeUrls]);

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
        chunkBlobsRef.current.clear();
        envelopeRef.current = null;
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
        // Кладём и сам blob — из него потом посчитаем огибающую для орба.
        chunkBlobsRef.current.set(url, blob);
        return url;
    }, []);

    const playUrl = useCallback((url) => new Promise((resolve, reject) => {
        const el = ensureAudioEl();
        el.onended = () => resolve();
        el.onerror = () => reject(new Error('audio-element-error'));
        el.src = url;
        // Огибающая предыдущего куска больше не актуальна.
        envelopeRef.current = null;
        const blob = chunkBlobsRef.current.get(url);
        if (blob) {
            // НЕ ждём: декодирование идёт параллельно воспроизведению,
            // чтобы не добавлять задержку до первого звука.
            blob.arrayBuffer().then(computeEnvelope).catch(() => { /* noop */ });
        }
        const p = el.play();
        if (p && typeof p.catch === 'function') {
            p.catch((e) => {
                // Прерывание своим же stop()/barge-in — штатная ситуация,
                // не ошибка для пользователя.
                if (e?.name === 'AbortError') { resolve(); return; }
                reject(e);
            });
        }
    }), [ensureAudioEl, computeEnvelope]);

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

    // ==========================================
    // Потоковый режим: очередь предложений
    // ==========================================
    // Используется, когда ответ приходит с бэкенда по предложениям (SSE,
    // см. streamVoiceMessage). Каждое пришедшее предложение сразу встаёт
    // в очередь; фоновый «насос» синтезирует и проигрывает их строго по
    // порядку, при этом синтез СЛЕДУЮЩЕГО стартует, пока играет текущее.
    const queueRef = useRef([]);
    const pumpingRef = useRef(false);
    const streamDoneRef = useRef(false);

    const pump = useCallback(async (opts, myRun) => {
        if (pumpingRef.current) return;
        pumpingRef.current = true;
        try {
            let pending = null; // уже запущенный синтез следующего куска
            while (runIdRef.current === myRun) {
                let url = null;
                if (pending) { url = await pending; pending = null; }
                else if (queueRef.current.length) {
                    const next = queueRef.current.shift();
                    url = await fetchChunk(next, opts, abortRef.current?.signal);
                } else if (streamDoneRef.current) {
                    break; // поток закончился и очередь пуста — всё сказали
                } else {
                    // Ждём следующее предложение от модели.
                    await new Promise((r) => setTimeout(r, 60));
                    continue;
                }
                if (runIdRef.current !== myRun || !url) break;

                setLoading(false);
                setSpeaking(true);
                // Пока играет текущее, синтезируем следующее из очереди.
                if (queueRef.current.length) {
                    const next = queueRef.current.shift();
                    pending = fetchChunk(next, opts, abortRef.current?.signal).catch(() => null);
                }
                await playUrl(url);
            }
            if (runIdRef.current === myRun) setSpeaking(false);
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
            setError('Не удалось воспроизвести ответ');
        } finally {
            pumpingRef.current = false;
        }
    }, [fetchChunk, playUrl]);

    // Начать новый потоковый ответ: очищает всё предыдущее.
    const beginStream = useCallback((opts) => {
        stop();
        queueRef.current = [];
        streamDoneRef.current = false;
        setError(null);
        setLimitExceeded(false);
        setLoading(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const myRun = runIdRef.current;
        return {
            push: (sentence) => {
                if (runIdRef.current !== myRun) return;
                const clean = sanitizeForSpeech(sentence);
                if (clean) queueRef.current.push(clean);
                pump(opts, myRun);
            },
            finish: () => {
                if (runIdRef.current !== myRun) return;
                streamDoneRef.current = true;
                pump(opts, myRun);
            },
        };
    }, [pump, stop]);

    // Явный сброс ошибки — чтобы «залипшая» ошибка не блокировала
    // возобновление разговора (см. жалобу: после неё нельзя начать заново).
    const clearError = useCallback(() => { setError(null); setLimitExceeded(false); }, []);

    return { speak, beginStream, stop, stopGraceful, unlock, clearError, speaking, loading, error, limitExceeded, audioRef, envelopeRef };
}
