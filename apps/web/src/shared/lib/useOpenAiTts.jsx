import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, apiFetchBlob, ApiError } from '@/shared/api/client';

// ==========================================
// useOpenAiTts — озвучка через бэкенд (Fish Audio S2.1 Pro / OpenAI TTS-1)
// ==========================================
// Клиент шлёт POST /tts/synthesize с текстом+провайдером+голосом, получает
// MP3 blob и играет через <audio>. По сравнению с Web Speech API это даёт:
//   • одинаковое качество на любом устройстве и в любом браузере,
//   • несколько голосов на выбор (Fish Audio — динамический список,
//     OpenAI — шесть фиксированных: alloy/echo/fable/onyx/nova/shimmer),
//   • корректный русский и подхват любого языка входного текста.
//
// Оба провайдера идут через один и тот же buffered-путь (см. комментарий
// в tts.controller.ts про Cloudflare) — hook про это не знает, для него
// это просто «эндпоинт вернул MP3 blob».
//
// Если бэкенд TTS недоступен (нет ключа, ошибка сети, лимит) — молча
// откатываемся на Web Speech API как раньше, чтобы не ломать UX. О лимите
// уведомляем текстом, чтобы пользователь понял почему TTS сдался.

// Официальные голоса OpenAI TTS-1 — фиксированный список, в отличие от
// Fish Audio (см. useFishVoices ниже) он не меняется и не требует запроса.
export const OPENAI_TTS_VOICES = [
    { id: 'alloy',   name: 'Alloy',   desc: 'Универсальный, нейтральный' },
    { id: 'echo',    name: 'Echo',    desc: 'Мужской, спокойный' },
    { id: 'fable',   name: 'Fable',   desc: 'Женский, тёплый' },
    { id: 'onyx',    name: 'Onyx',    desc: 'Мужской, глубокий' },
    { id: 'nova',    name: 'Nova',    desc: 'Женский, живой' },
    { id: 'shimmer', name: 'Shimmer', desc: 'Женский, мягкий' },
];

// Модуль-level кэш списка голосов Fish Audio — переживает
// размонтирование/повторное открытие настроек озвучки в рамках одной
// вкладки, чтобы не дёргать /tts/fish/voices при каждом открытии модалки.
let fishVoicesCache = null;   // Array<{id,title}> | null
let fishVoicesPromise = null; // in-flight запрос, чтобы не дублировать

// Хук отдельно от useOpenAiTts — только подтягивает список голосов Fish
// Audio с бэкенда (реальный список приходит из /model Fish Audio, id
// голосов туда «зашиты» быть не могут — они произвольные и могут
// меняться, поэтому список именно динамический, а не хардкод).
export function useFishVoices() {
    const [voices, setVoices] = useState(fishVoicesCache || []);
    const [loading, setLoading] = useState(!fishVoicesCache);

    useEffect(() => {
        if (fishVoicesCache) { setVoices(fishVoicesCache); setLoading(false); return; }
        let cancelled = false;
        if (!fishVoicesPromise) {
            fishVoicesPromise = apiFetch('/tts/fish/voices', { method: 'POST' })
                .then(res => Array.isArray(res?.items) ? res.items : [])
                .catch(() => [])
                .finally(() => { fishVoicesPromise = null; });
        }
        fishVoicesPromise.then(items => {
            if (cancelled) return;
            fishVoicesCache = items;
            setVoices(items);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    return { voices, loading };
}

export function useOpenAiTts() {
    const [speaking, setSpeaking] = useState(false);
    const [paused, setPaused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(null);
    // Отдельный флаг именно для «дневной лимит озвучки исчерпан» (HTTP 403
    // от /tts/synthesize) — Voice Mode должен реагировать на этот конкретный
    // случай особым образом (модалка + красный статичный орб, см.
    // useVoiceMode.jsx), а не как на обычную ошибку воспроизведения.
    // Матчить по тексту error было бы хрупко, поэтому — отдельный boolean.
    const [limitExceeded, setLimitExceeded] = useState(false);
    // audioEl раньше использовался VoiceOrb для подключения Web Audio API
    // (AnalyserNode) и синхронной со звуком анимации — эта логика убрана
    // (см. VoiceOrb.jsx: переподключение аудио через createMediaElementSource
    // искажало сам звук на части устройств и роняло события ended/timeupdate).
    // Поле оставлено в состоянии как есть — оно ни на что не влияет и может
    // ещё пригодиться, но больше никем не читается.
    const [audioEl, setAudioEl] = useState(null);

    const audioRef = useRef(null);
    const urlRef = useRef(null);
    const requestTokenRef = useRef(null);
    // Фолбэк на Web Speech: заводим отложенно, только если OpenAI TTS упал.
    const fallbackUtterRef = useRef(null);
    // Страховочный таймер: если событие 'ended'/'onerror' у <audio> по
    // какой-то причине не сработает (нестабильные метаданные конкретного
    // MP3-файла, редкий баг конкретного браузера и т.п.), speaking иначе
    // навсегда останется true — UI («Проверить голос», VoiceOrb) зависнет
    // в состоянии «озвучиваю» без возможности выйти из него. Таймер грубо
    // гарантирует, что speaking рано или поздно сбросится сам, независимо
    // от причины сбоя у конкретного провайдера/файла.
    const watchdogRef = useRef(null);
    const clearWatchdog = useCallback(() => {
        if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
    }, []);

    const cleanupAudio = useCallback(() => {
        const el = audioRef.current;
        if (el) {
            try { el.pause(); } catch { /* noop */ }
            el.src = '';
            audioRef.current = null;
        }
        if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        }
        setAudioEl(null);
    }, []);

    const stop = useCallback(() => {
        // Останавливаем и OpenAI-плеер, и Web Speech-фолбэк.
        clearWatchdog();
        cleanupAudio();
        if (fallbackUtterRef.current) {
            try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
            fallbackUtterRef.current = null;
        }
        setSpeaking(false);
        setPaused(false);
        setLoading(false);
        setElapsed(0);
    }, [cleanupAudio, clearWatchdog]);

    // Гарантированная чистка при размонтировании
    useEffect(() => () => stop(), [stop]);

    const speakWithFallback = useCallback((text, opts = {}) => {
        if (!window.speechSynthesis) { setError('Озвучка недоступна'); return; }
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }

        const doSpeak = () => {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = opts.lang || 'ru-RU';
            u.rate = opts.speed || 1.0;
            u.onend = () => { fallbackUtterRef.current = null; setSpeaking(false); };
            u.onerror = () => { fallbackUtterRef.current = null; setSpeaking(false); setError('Ошибка озвучки'); };
            fallbackUtterRef.current = u;
            window.speechSynthesis.speak(u);
            setSpeaking(true);

            // Сторож (баг-фикс): на части мобильных браузеров (особенно
            // WebView/встроенные браузеры типа Яндекс.Браузера внутри
            // приложения) speechSynthesis.speak() иногда молча не
            // запускается — ни onstart, ни onerror не срабатывают, речь
            // просто никогда не звучит, а UI остаётся в состоянии
            // «озвучиваю» бесконечно. Через 1.2с проверяем реальный флаг
            // window.speechSynthesis.speaking — если движок так и не начал
            // говорить, считаем это ошибкой и показываем понятное
            // сообщение вместо вечного зависания.
            setTimeout(() => {
                if (fallbackUtterRef.current === u && !window.speechSynthesis.speaking) {
                    fallbackUtterRef.current = null;
                    setSpeaking(false);
                    setError('Не удалось воспроизвести озвучку на этом устройстве');
                }
            }, 1200);
        };

        // Голоса speechSynthesis грузятся АСИНХРОННО и на первом обращении
        // к странице список может быть ещё пуст (особенно на iOS/Chrome) —
        // speak() в этот момент либо молчит, либо использует голос по
        // умолчанию без нужного языка. Ждём onvoiceschanged перед стартом,
        // но не дольше 800мс, чтобы не задерживать реальную озвучку.
        if (window.speechSynthesis.getVoices().length === 0) {
            let started = false;
            const onVoices = () => {
                if (started) return;
                started = true;
                window.speechSynthesis.onvoiceschanged = null;
                doSpeak();
            };
            window.speechSynthesis.onvoiceschanged = onVoices;
            setTimeout(onVoices, 800);
        } else {
            doSpeak();
        }
    }, []);

    const speak = useCallback(async (text, opts = {}) => {
        if (!text || !text.trim()) return;
        stop();
        setError(null);
        setLimitExceeded(false);
        setLoading(true);

        // Защита от гонки при быстром повторном нажатии — см. историю
        // предыдущих правок: без токена два fetch могли создать по
        // <audio> и обрезать друг друга.
        const myToken = Symbol('tts-request');
        requestTokenRef.current = myToken;

        // OpenAI TTS ограничен 4096 символами на запрос. Если больше — режем.
        const safeText = text.length > 4096 ? text.slice(0, 4096) : text;

        try {
            // Провайдер: 'fish' (Fish Audio S2.1 Pro) по умолчанию для новых
            // и уже существующих пользователей без сохранённого выбора —
            // opts.provider приходит из state.ttsProvider, который так же
            // фолбэчится на 'fish' на уровне ChatView/VoiceSettings.
            const provider = opts.provider === 'openai' ? 'openai' : 'fish';
            const blob = await apiFetchBlob('/tts/synthesize', {
                method: 'POST',
                body: {
                    text: safeText,
                    provider,
                    // Для OpenAI — имя голоса (nova и т.п.), для Fish —
                    // reference_id голоса или undefined (голос по умолчанию).
                    voice: opts.voice || (provider === 'openai' ? 'nova' : undefined),
                    emotion: opts.emotion || undefined,
                    speed: opts.speed || 1.0,
                },
            });

            if (requestTokenRef.current !== myToken) return;

            const url = URL.createObjectURL(blob);
            urlRef.current = url;
            const audio = new Audio();
            // preload="auto" + ждать canplaythrough перед play() — раньше
            // play() стартовал сразу после new Audio(url), когда браузер
            // ещё даже не начал декодировать MP3. Это давало два бага
            // разом: (1) первое слово стартовало с задержкой и слышалось
            // «обрубленным»; (2) на медленной сети .play() отклонялся с
            // NotAllowedError/NotSupportedError, и мы ошибочно показывали
            // «Не удалось воспроизвести аудио», хотя файл был валидный.
            audio.preload = 'auto';
            audio.src = url;
            audioRef.current = audio;
            setAudioEl(audio);

            audio.onloadedmetadata = () => setDuration(audio.duration || 0);
            audio.ontimeupdate = () => setElapsed(audio.currentTime || 0);
            audio.onended = () => { clearWatchdog(); setSpeaking(false); setPaused(false); };
            // onerror сбрасывался при ЛЮБОЙ ошибке медиа-элемента,
            // включая безобидную MEDIA_ERR_ABORTED (когда мы сами
            // сменили src или вызвали stop()). Фильтруем только реальные
            // ошибки декодирования/сети — MEDIA_ERR_DECODE (3) и
            // MEDIA_ERR_SRC_NOT_SUPPORTED (4).
            audio.onerror = () => {
                const code = audio.error?.code;
                if (code === 3 || code === 4) {
                    clearWatchdog();
                    setError('Не удалось воспроизвести аудио');
                    setSpeaking(false);
                }
            };

            // Ждём, пока браузер сможет проиграть файл БЕЗ пауз до конца
            // (canplaythrough), а не начинает play() как только пришли
            // первые байты. Максимум 5 сек ожидания — потом всё равно
            // пробуем, чтобы не висеть вечно на очень слабых устройствах.
            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    audio.removeEventListener('canplaythrough', finish);
                    resolve();
                };
                audio.addEventListener('canplaythrough', finish, { once: true });
                setTimeout(finish, 5000);
                audio.load();
            });

            if (requestTokenRef.current !== myToken) return;

            setLoading(false);
            setSpeaking(true);
            try {
                await audio.play();
                // Страховочный таймер (см. объявление watchdogRef выше): если
                // 'ended'/'onerror' у этого конкретного файла почему-либо не
                // сработают (нестабильные метаданные MP3 у части
                // провайдеров/браузеров), speaking всё равно сбросится сам —
                // UI не зависнет в состоянии «озвучиваю» навсегда. Оценка
                // длительности: реальная audio.duration, если она конечна и
                // известна, иначе грубая оценка по длине текста (≈15
                // символов/сек живой речи), с разумными нижней и верхней
                // границами на случай совсем короткого/длинного текста.
                clearWatchdog();
                const estByText = Math.min(60, Math.max(8, safeText.length / 15 + 5));
                const estByDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration + 3 : null;
                const watchdogSec = estByDuration ?? estByText;
                watchdogRef.current = setTimeout(() => {
                    if (audioRef.current === audio && !audio.ended) {
                        console.warn('[useOpenAiTts] watchdog: событие ended не пришло вовремя, принудительно сбрасываю состояние');
                        setSpeaking(false);
                        setPaused(false);
                    }
                }, watchdogSec * 1000);
            } catch (playErr) {
                // AbortError возникает при stop()/сmене src во время play() —
                // это НЕ ошибка воспроизведения, ничего пользователю не
                // показываем. Всё остальное — реальная проблема (autoplay-
                // policy без user-gesture и т.п.).
                if (playErr?.name === 'AbortError') return;
                console.warn('[useOpenAiTts] play() отклонён:', playErr?.message);
                setError('Не удалось воспроизвести аудио');
                setSpeaking(false);
            }
        } catch (e) {
            if (requestTokenRef.current !== myToken) return;
            setLoading(false);
            if (e instanceof ApiError && e.status === 403) {
                setError(e.message || 'Дневной лимит озвучки исчерпан');
                setLimitExceeded(true);
                return;
            }
            // eslint-disable-next-line no-console
            console.warn('[useOpenAiTts] Падение OpenAI TTS, фолбэк на Web Speech:', e?.message);
            speakWithFallback(safeText, opts);
        }
    }, [stop, speakWithFallback, clearWatchdog]);

    const pause = useCallback(() => {
        if (audioRef.current && !paused) { try { audioRef.current.pause(); } catch { /* noop */ } setPaused(true); }
        else if (fallbackUtterRef.current && !paused) { try { window.speechSynthesis?.pause(); } catch { /* noop */ } setPaused(true); }
    }, [paused]);

    const resume = useCallback(() => {
        if (audioRef.current && paused) { try { audioRef.current.play(); } catch { /* noop */ } setPaused(false); }
        else if (fallbackUtterRef.current && paused) { try { window.speechSynthesis?.resume(); } catch { /* noop */ } setPaused(false); }
    }, [paused]);

    const seek = useCallback((deltaSec) => {
        if (audioRef.current) {
            const next = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + deltaSec));
            audioRef.current.currentTime = next;
            setElapsed(next);
        }
    }, []);

    return { speak, pause, resume, stop, seek, speaking, paused, loading, elapsed, duration, error, limitExceeded, supported: true, audioRef, audioEl };
}
