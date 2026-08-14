import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceModeRecognition } from '@/shared/lib/useVoiceModeRecognition';
import { useOpenAiTts } from '@/shared/lib/useOpenAiTts';

// ==========================================
// useVoiceMode — разговорный голосовой режим чата (hands-free)
// ==========================================
// По задаче: нажатий быть не должно. Открыл Voice Mode — можно сразу
// говорить, без тапа по орбу. Тишина после фразы = «договорил», отправляем.
// Если Сара говорит и пользователь начинает говорить — это барж-ин:
// голос мгновенно останавливается и слушаем новую фразу.
//
// Технически: STT — Web Speech API через useVoiceModeRecognition
// (непрерывное распознавание, НЕ Fish Transcribe-1 — см. предыдущее
// обсуждение области этого раунда). TTS — существующий бэкенд
// /tts/synthesize (тот же голос, что выбран в Настройках/в самом Voice
// Mode — см. VoiceModeOverlay). Модель ИИ на время разговора всегда
// переключается на самую быструю (Void Mini/Groq) — см. open()/close().

export const VOICE_MODE_PHASE = {
    IDLE: 'idle',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
    ERROR: 'error',
};

export function useVoiceMode({ state, updateState, handleSendMessage, voiceOpts, lang = 'ru-RU' }) {
    const [active, setActive] = useState(false);
    const [phase, setPhase] = useState(VOICE_MODE_PHASE.IDLE);
    const [muted, setMuted] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    const savedModelIdRef = useRef(null);
    const phaseRef = useRef(VOICE_MODE_PHASE.IDLE);
    const mutedRef = useRef(false);
    const pendingReplyRef = useRef(false);

    const tts = useOpenAiTts();

    const setPhaseBoth = useCallback((p) => { phaseRef.current = p; setPhase(p); }, []);

    // Пользователь заговорил — этот колбэк прилетает на КАЖДЫЙ кусок речи,
    // в т.ч. пока Сара говорит. Единственное реальное действие здесь —
    // барж-ин: если Сара как раз отвечает голосом, тут же обрываем её и
    // переключаемся в «слушаю». Во всех остальных фазах (IDLE/LISTENING)
    // ничего специального делать не нужно — распознавание и так копит
    // текст само, дождёмся тишины (см. onUtterance).
    const handleSpeechActivity = useCallback(() => {
        if (mutedRef.current) return;
        if (phaseRef.current === VOICE_MODE_PHASE.SPEAKING) {
            tts.stop();
            pendingReplyRef.current = false;
            setPhaseBoth(VOICE_MODE_PHASE.LISTENING);
            return;
        }
        if (phaseRef.current === VOICE_MODE_PHASE.IDLE) {
            setPhaseBoth(VOICE_MODE_PHASE.LISTENING);
        }
        // Во время THINKING намеренно ничего не делаем — не хотим обрывать
        // уже улетевший запрос из-за случайного шума/эха, пока ждём ответ.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setPhaseBoth]);

    // Пользователь замолчал (тишина ~1.1с) — фраза готова, отправляем.
    const handleUtterance = useCallback((text) => {
        if (!text || !text.trim()) { setPhaseBoth(VOICE_MODE_PHASE.IDLE); return; }
        // Пока ждём ответ на предыдущую реплику, новую фразу не шлём —
        // это защита от повторной отправки из-за случайно пойманного шума.
        if (phaseRef.current === VOICE_MODE_PHASE.THINKING) return;
        setPhaseBoth(VOICE_MODE_PHASE.THINKING);
        pendingReplyRef.current = true;
        handleSendMessage(text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleSendMessage, setPhaseBoth]);

    const recognition = useVoiceModeRecognition({
        lang,
        onUtterance: handleUtterance,
        onSpeechActivity: handleSpeechActivity,
    });

    // Как только ответ ИИ дописан (isGenerating: true → false) и мы его
    // ждали — берём последнее сообщение ассистента из активного чата и
    // озвучиваем. Сообщение и isGenerating:false приходят одним и тем же
    // setState в App.jsx, поэтому гонки здесь нет.
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
                setPhaseBoth(VOICE_MODE_PHASE.SPEAKING);
                tts.speak(last.content, voiceOpts());
            } else {
                setPhaseBoth(VOICE_MODE_PHASE.IDLE);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isGenerating, active]);

    // Озвучка естественно закончилась (не прервана барж-ином) —
    // возвращаемся в ожидание речи (микрофон и так слушает непрерывно).
    useEffect(() => {
        if (!active) return;
        if (phase === VOICE_MODE_PHASE.SPEAKING && !tts.speaking && !tts.loading && !tts.error) {
            setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        }
    }, [tts.speaking, tts.loading, tts.error, phase, active, setPhaseBoth]);

    useEffect(() => {
        if (!active || !tts.error) return;
        setErrorMsg(tts.error);
        setPhaseBoth(VOICE_MODE_PHASE.ERROR);
    }, [tts.error, active, setPhaseBoth]);

    const open = useCallback(() => {
        // Voice Mode всегда переключает на Void Mini (id 'flash') — самую
        // быструю модель (Groq), безлимитную и бесплатную на любом тарифе.
        // Модель из обычного чата запоминаем и возвращаем при закрытии.
        savedModelIdRef.current = state.selectedModelId;
        if (state.selectedModelId !== 'flash') updateState({ selectedModelId: 'flash' });

        setActive(true);
        setErrorMsg(null);
        pendingReplyRef.current = false;
        mutedRef.current = false;
        setMuted(false);
        setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        // Слушаем сразу — без тапа по орбу.
        recognition.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedModelId, updateState, setPhaseBoth]);

    const close = useCallback(() => {
        setActive(false);
        recognition.stop();
        tts.stop();
        pendingReplyRef.current = false;
        setErrorMsg(null);
        setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        if (savedModelIdRef.current && savedModelIdRef.current !== 'flash') {
            updateState({ selectedModelId: savedModelIdRef.current });
        }
        savedModelIdRef.current = null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateState, setPhaseBoth]);

    // Тап по орбу больше не обязателен, но оставлен как удобная ручная
    // подстраховка: во время речи Сары — тот же барж-ин, что и голосом;
    // во время «слушаю» — не ждать тишину, а отправить фразу сразу же.
    const primaryTap = useCallback(() => {
        if (mutedRef.current) return;
        if (phaseRef.current === VOICE_MODE_PHASE.SPEAKING) {
            handleSpeechActivity();
            return;
        }
        if (phaseRef.current === VOICE_MODE_PHASE.LISTENING) {
            recognition.finalizeNow();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleSpeechActivity]);

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
