import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceModeRecognition } from '@/shared/lib/useVoiceModeRecognition';
import { useVoiceModeSpeech } from '@/shared/lib/useVoiceModeSpeech';
import { playVoiceModeOpenChime, playVoiceModeCloseChime } from '@/shared/lib/voiceModeChime';

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

    const speech = useVoiceModeSpeech();

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

    // Пользователь замолчал — фраза готова, отправляем.
    const handleUtterance = useCallback((text) => {
        if (!text || !text.trim()) { setPhaseBoth(VOICE_MODE_PHASE.IDLE); return; }
        if (phaseRef.current === VOICE_MODE_PHASE.THINKING) return;
        setPhaseBoth(VOICE_MODE_PHASE.THINKING);
        pendingReplyRef.current = true;
        handleSendMessage(text);
    }, [handleSendMessage, setPhaseBoth]);

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
                    speech.stop();
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

    // ---- Ответ ИИ дописан → озвучиваем ----
    const wasGeneratingRef = useRef(state.isGenerating);
    useEffect(() => {
        const wasGenerating = wasGeneratingRef.current;
        wasGeneratingRef.current = state.isGenerating;
        if (!active || !pendingReplyRef.current) return;
        if (wasGenerating && !state.isGenerating) {
            pendingReplyRef.current = false;
            const activeChat = (state.chatSessions || []).find((c) => c.id === state.activeChatId);
            const messages = activeChat?.messages || [];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant' && last.content) {
                // Пауза распознавания ДО старта озвучки — чтобы первые же
                // слова Сары не попали в её собственный микрофон.
                recognition.pause();
                setPhaseBoth(VOICE_MODE_PHASE.SPEAKING);
                speech.speak(last.content, voiceOpts());
            } else {
                setPhaseBoth(VOICE_MODE_PHASE.IDLE);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isGenerating, active]);

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
            speech.stop();
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
    };
}
