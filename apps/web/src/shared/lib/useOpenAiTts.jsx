import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetchBlob, ApiError } from '@/shared/api/client';

// ==========================================
// useOpenAiTts — озвучка через OpenAI TTS-1
// ==========================================
// Клиент шлёт POST /tts/synthesize с текстом+голосом, получает MP3 blob и
// играет через <audio>. По сравнению с Web Speech API это даёт:
//   • одинаковое качество на любом устройстве и в любом браузере,
//   • шесть голосов OpenAI (alloy/echo/fable/onyx/nova/shimmer),
//   • корректный русский и подхват любого языка входного текста.
//
// Если бэкенд TTS недоступен (нет ключа, ошибка сети, лимит) — молча
// откатываемся на Web Speech API как раньше, чтобы не ломать UX. О лимите
// уведомляем текстом, чтобы пользователь понял почему TTS сдался.

// Официальные голоса OpenAI TTS-1.
export const OPENAI_TTS_VOICES = [
    { id: 'alloy',   name: 'Alloy',   desc: 'Универсальный, нейтральный' },
    { id: 'echo',    name: 'Echo',    desc: 'Мужской, спокойный' },
    { id: 'fable',   name: 'Fable',   desc: 'Женский, тёплый' },
    { id: 'onyx',    name: 'Onyx',    desc: 'Мужской, глубокий' },
    { id: 'nova',    name: 'Nova',    desc: 'Женский, живой' },
    { id: 'shimmer', name: 'Shimmer', desc: 'Женский, мягкий' },
];

export function useOpenAiTts() {
    const [speaking, setSpeaking] = useState(false);
    const [paused, setPaused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(null);

    const audioRef = useRef(null);
    const urlRef = useRef(null);
    // Фолбэк на Web Speech: заводим отложенно, только если OpenAI TTS упал.
    const fallbackUtterRef = useRef(null);

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
    }, []);

    const stop = useCallback(() => {
        // Останавливаем и OpenAI-плеер, и Web Speech-фолбэк.
        cleanupAudio();
        if (fallbackUtterRef.current) {
            try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
            fallbackUtterRef.current = null;
        }
        setSpeaking(false);
        setPaused(false);
        setLoading(false);
        setElapsed(0);
    }, [cleanupAudio]);

    // Гарантированная чистка при размонтировании
    useEffect(() => () => stop(), [stop]);

    const speakWithFallback = useCallback((text, opts = {}) => {
        if (!window.speechSynthesis) { setError('Озвучка недоступна'); return; }
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = opts.lang || 'ru-RU';
        u.rate = opts.speed || 1.0;
        u.onend = () => { fallbackUtterRef.current = null; setSpeaking(false); };
        u.onerror = () => { fallbackUtterRef.current = null; setSpeaking(false); setError('Ошибка озвучки'); };
        fallbackUtterRef.current = u;
        window.speechSynthesis.speak(u);
        setSpeaking(true);
    }, []);

    const speak = useCallback(async (text, opts = {}) => {
        if (!text || !text.trim()) return;
        stop();
        setError(null);
        setLoading(true);

        // OpenAI TTS ограничен 4096 символами на запрос. Если больше — режем.
        const safeText = text.length > 4096 ? text.slice(0, 4096) : text;

        try {
            const blob = await apiFetchBlob('/tts/synthesize', {
                method: 'POST',
                body: {
                    text: safeText,
                    voice: opts.voice || 'nova',
                    speed: opts.speed || 1.0,
                },
            });

            const url = URL.createObjectURL(blob);
            urlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onloadedmetadata = () => setDuration(audio.duration || 0);
            audio.ontimeupdate = () => setElapsed(audio.currentTime || 0);
            audio.onended = () => { setSpeaking(false); setPaused(false); };
            audio.onerror = () => { setError('Не удалось воспроизвести аудио'); setSpeaking(false); };

            setLoading(false);
            setSpeaking(true);
            await audio.play();
        } catch (e) {
            setLoading(false);
            // Ошибка лимита — показываем сообщение, не идём в фолбэк
            // (пользователь не должен думать, что «работает» — платный ресурс кончился).
            if (e instanceof ApiError && e.status === 403) {
                setError(e.message || 'Дневной лимит озвучки исчерпан');
                return;
            }
            // eslint-disable-next-line no-console
            console.warn('[useOpenAiTts] Падение OpenAI TTS, фолбэк на Web Speech:', e?.message);
            // Иначе — молча Web Speech
            speakWithFallback(safeText, opts);
        }
    }, [stop, speakWithFallback]);

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

    return { speak, pause, resume, stop, seek, speaking, paused, loading, elapsed, duration, error, supported: true, audioRef };
}
