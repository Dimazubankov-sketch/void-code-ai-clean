import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceModeRecognition } from '@/shared/lib/useVoiceModeRecognition';
import { useVoiceModeSpeech } from '@/shared/lib/useVoiceModeSpeech';
import { playVoiceModeOpenChime, playVoiceModeCloseChime } from '@/shared/lib/voiceModeChime';
import { createBackendChat, streamVoiceMessage } from '@/shared/api/chat';
import { BUILTIN_PERSONAS } from '@/features/chat/VoiceModeSettings';

// ==========================================
// useVoiceMode — разговорный голосовой режим чата (hands-free)
// ==========================================
// Нажатий не требуется: открыл — говори. Тишина после фразы = «договорил»,
// отправляем. Пока Сара отвечает, распознавание ПРИОСТАНОВЛЕНО (иначе она
// слышит саму себя и обрывается), а перебивание ловится по уровню сигнала
// с микрофона — см. барж-ин-монитор ниже.
//
// Озвучка идёт через useVoiceModeSpeech: ответ режется на фразы, первая
// звучит почти сразу, остальные подгружаются фоном (см. комментарий там).
// Модель ИИ на время разговора всегда переключается на самую быструю
// (Void Mini/Groq) — см. open()/close().

export const VOICE_MODE_PHASE = {
    IDLE: 'idle',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
    ERROR: 'error',
    LIMIT: 'limit',
};

const LIMIT_WARNING_TTL_MS = 6 * 60 * 60 * 1000;

// Барж-ин по уровню сигнала: насколько громко и как долго должен звучать
// микрофон, чтобы считать это перебиванием, а не эхом Сары из динамика.
// Порог намеренно выше «шёпота»: эхоподавление браузера ослабляет её
// голос, но не убирает полностью, и слишком чуткий порог возвращает ровно
// ту проблему, из-за которой Сара обрывала себя на полуслове.
const BARGE_IN_LEVEL = 0.16;
const BARGE_IN_SUSTAIN_MS = 280;
// Обычную (не лимитную) ошибку не оставляем висеть — иначе разговор
// невозможно возобновить, пока не выйдешь и не зайдёшь заново.
const ERROR_AUTO_CLEAR_MS = 2500;

export function useVoiceMode({ state, updateState, handleSendMessage, voiceOpts, lang = 'ru-RU' }) {
    const [active, setActive] = useState(false);
    const [phase, setPhase] = useState(VOICE_MODE_PHASE.IDLE);
    const [muted, setMuted] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    const savedModelIdRef = useRef(null);
    const phaseRef = useRef(VOICE_MODE_PHASE.IDLE);
    const mutedRef = useRef(false);
    const pendingReplyRef = useRef(false);
    const streamAbortRef = useRef(null);
    const backendChatIdRef = useRef(null);

    const speech = useVoiceModeSpeech();

    // Разговор в голосовом режиме ведётся в отдельной серверной сессии
    // чата — она создаётся один раз за вход в режим и переиспользуется,
    // чтобы у модели был контекст предыдущих реплик.
    const ensureBackendChatId = useCallback(async () => {
        if (!backendChatIdRef.current) backendChatIdRef.current = await createBackendChat();
        return backendChatIdRef.current;
    }, []);

    // Дописываем реплики в активный чат, чтобы разговор был виден текстом.
    // ВАЖНО: updateState в App.jsx принимает только ОБЪЕКТ изменений
    // (не функцию-апдейтер), поэтому новый список сессий собираем здесь
    // из актуального state, который приходит пропсом на каждый рендер.
    const stateRef = useRef(state);
    stateRef.current = state;
    const appendVoiceMessage = useCallback((msg) => {
        const prev = stateRef.current;
        const sessions = prev.chatSessions || [];
        if (!sessions.some((c) => c.id === prev.activeChatId)) return;
        updateState({
            chatSessions: sessions.map((s) => (
                s.id === prev.activeChatId ? { ...s, messages: [...s.messages, msg] } : s
            )),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateState]);

    const setPhaseBoth = useCallback((p) => { phaseRef.current = p; setPhase(p); }, []);

    // Пользователь заговорил (по данным распознавания). Во время речи Сары
    // этот колбэк уже не приходит — распознавание на паузе, перебивание
    // ловит отдельный монитор уровня (ниже).
    const handleSpeechActivity = useCallback(() => {
        if (mutedRef.current) return;
        if (phaseRef.current === VOICE_MODE_PHASE.IDLE || phaseRef.current === VOICE_MODE_PHASE.ERROR) {
            setPhaseBoth(VOICE_MODE_PHASE.LISTENING);
        }
    }, [setPhaseBoth]);

    // Пользователь замолчал — фраза готова, отправляем В ПОТОКОВОМ режиме.
    // Ответ приходит с бэкенда предложение за предложением (SSE) и сразу
    // уходит в очередь озвучки — не ждём, пока модель допишет весь ответ.
    const handleUtterance = useCallback(async (text) => {
        if (!text || !text.trim()) { setPhaseBoth(VOICE_MODE_PHASE.IDLE); return; }
        if (phaseRef.current === VOICE_MODE_PHASE.THINKING) return;
        setPhaseBoth(VOICE_MODE_PHASE.THINKING);

        // Глушим распознавание ДО первого звука ответа — иначе микрофон
        // услышит Сару и сработает ложное перебивание.
        recognition.pause();

        const controller = new AbortController();
        streamAbortRef.current = controller;
        const stream = speech.beginStream(voiceOpts());
        let sawFirst = false;

        // Показываем реплику пользователя в чате сразу.
        appendVoiceMessage({ role: 'user', content: text });

        try {
            const chatId = await ensureBackendChatId();
            // Инструкции выбранной личности дописываются к системному
            // промпту голосового режима на бэкенде (см. VOICE_SYSTEM_PROMPT).
            const prev = stateRef.current;
            const personas = [...BUILTIN_PERSONAS, ...(prev.voicePersonas || [])];
            const persona = personas.find((x) => x.id === (prev.activePersonaId || BUILTIN_PERSONAS[0].id));
            const full = await streamVoiceMessage(chatId, text, {
                persona: persona?.instructions || undefined,
                signal: controller.signal,
                onSentence: (sentence) => {
                    if (!sawFirst) { sawFirst = true; setPhaseBoth(VOICE_MODE_PHASE.SPEAKING); }
                    stream.push(sentence);
                },
            });
            stream.finish();
            if (full) appendVoiceMessage({ role: 'assistant', content: full });
        } catch (e) {
            stream.finish();
            if (e?.name === 'AbortError') return;
            setErrorMsg(e?.message || 'Не удалось получить ответ');
            setPhaseBoth(VOICE_MODE_PHASE.ERROR);
        } finally {
            streamAbortRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setPhaseBoth, voiceOpts]);

    const recognition = useVoiceModeRecognition({
        lang,
        onUtterance: handleUtterance,
        onSpeechActivity: handleSpeechActivity,
    });

    // ---- Барж-ин по уровню сигнала (только пока говорит Сара) ----
    useEffect(() => {
        if (!active || phase !== VOICE_MODE_PHASE.SPEAKING || muted) return undefined;
        let raf = null;
        let loudSince = 0;
        const analyser = recognition.analyserRef?.current;
        if (!analyser) return undefined;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            const level = sum / data.length / 255;
            const now = Date.now();
            if (level >= BARGE_IN_LEVEL) {
                if (!loudSince) loudSince = now;
                if (now - loudSince >= BARGE_IN_SUSTAIN_MS) {
                    // Перебили — глушим Сару и снова слушаем.
                    // Перебивание: обрываем поток LLM и мягко гасим голос
                    // (см. stopGraceful) — Сара затихает примерно за секунду,
                    // а не обрывается на полуслове рывком.
                    try { streamAbortRef.current?.abort(); } catch { /* noop */ }
                    speech.stopGraceful(900);
                    pendingReplyRef.current = false;
                    recognition.resume();
                    setPhaseBoth(VOICE_MODE_PHASE.LISTENING);
                    return;
                }
            } else {
                loudSince = 0;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { if (raf) cancelAnimationFrame(raf); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, phase, muted, setPhaseBoth]);

    // Ответ теперь приходит потоково прямо в handleUtterance (SSE), поэтому
    // прежний эффект «дождались isGenerating:false → озвучили целиком»
    // больше не нужен и удалён — он давал ровно ту задержку, от которой
    // мы уходим.

    // ---- Озвучка закончилась сама → снова слушаем ----
    useEffect(() => {
        if (!active) return;
        if (phase === VOICE_MODE_PHASE.SPEAKING && !speech.speaking && !speech.loading && !speech.error) {
            recognition.resume();
            setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speech.speaking, speech.loading, speech.error, phase, active]);

    // ---- Ошибки озвучки ----
    useEffect(() => {
        if (!active || !speech.error) return undefined;
        if (speech.limitExceeded) {
            recognition.stop();
            setErrorMsg(speech.error);
            setPhaseBoth(VOICE_MODE_PHASE.LIMIT);
            updateState({ ttsLimitExhaustedAt: Date.now() });
            return undefined;
        }
        // Обычный сбой воспроизведения: показываем ненадолго и САМИ
        // возвращаемся в рабочее состояние — разговор должен продолжаться
        // без выхода из режима (жалоба: «из-за неё невозможно повторно
        // начать беседу»).
        setErrorMsg(speech.error);
        setPhaseBoth(VOICE_MODE_PHASE.ERROR);
        const t = setTimeout(() => {
            speech.clearError();
            setErrorMsg(null);
            if (!mutedRef.current) recognition.resume();
            setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        }, ERROR_AUTO_CLEAR_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speech.error, speech.limitExceeded, active]);

    const open = useCallback(() => {
        // Оба вызова — синхронно внутри жеста пользователя: и «прогрев»
        // аудиоэлемента под autoplay-политику, и WebAudio для звука входа.
        speech.unlock();
        if (state.voiceModeSounds !== false) playVoiceModeOpenChime();

        savedModelIdRef.current = state.selectedModelId;
        if (state.selectedModelId !== 'flash') updateState({ selectedModelId: 'flash' });

        setActive(true);
        setErrorMsg(null);
        speech.clearError();
        pendingReplyRef.current = false;
        mutedRef.current = false;
        setMuted(false);

        const exhaustedAt = state.ttsLimitExhaustedAt;
        if (exhaustedAt && Date.now() - exhaustedAt < LIMIT_WARNING_TTL_MS) {
            setErrorMsg('Дневной лимит озвучки исчерпан. Попробуй позже.');
            setPhaseBoth(VOICE_MODE_PHASE.LIMIT);
            return;
        }
        if (exhaustedAt) updateState({ ttsLimitExhaustedAt: null });

        setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        recognition.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedModelId, state.ttsLimitExhaustedAt, state.voiceModeSounds, updateState, setPhaseBoth]);

    const close = useCallback(() => {
        if (state.voiceModeSounds !== false) playVoiceModeCloseChime();
        setActive(false);
        try { streamAbortRef.current?.abort(); } catch { /* noop */ }
        backendChatIdRef.current = null;
        recognition.stop();
        speech.stop();
        speech.clearError();
        pendingReplyRef.current = false;
        setErrorMsg(null);
        setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        if (savedModelIdRef.current && savedModelIdRef.current !== 'flash') {
            updateState({ selectedModelId: savedModelIdRef.current });
        }
        savedModelIdRef.current = null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.voiceModeSounds, updateState, setPhaseBoth]);

    // Тап по орбу — необязательная ручная подстраховка.
    const primaryTap = useCallback(() => {
        if (mutedRef.current) return;
        if (phaseRef.current === VOICE_MODE_PHASE.SPEAKING) {
            try { streamAbortRef.current?.abort(); } catch { /* noop */ }
            speech.stopGraceful(900);
            pendingReplyRef.current = false;
            recognition.resume();
            setPhaseBoth(VOICE_MODE_PHASE.LISTENING);
            return;
        }
        if (phaseRef.current === VOICE_MODE_PHASE.LISTENING) recognition.finalizeNow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setPhaseBoth]);

    const toggleMute = useCallback(() => {
        setMuted((m) => {
            const next = !m;
            mutedRef.current = next;
            if (next) {
                recognition.stop();
                if (phaseRef.current === VOICE_MODE_PHASE.LISTENING) setPhaseBoth(VOICE_MODE_PHASE.IDLE);
            } else {
                recognition.start();
            }
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setPhaseBoth]);

    return {
        active, phase, muted, errorMsg,
        open, close, primaryTap, toggleMute,
        analyserRef: recognition.analyserRef,
        speechAudioRef: speech.audioRef,
        speechEnvelopeRef: speech.envelopeRef,
    };
}
