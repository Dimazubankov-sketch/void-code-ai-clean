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
    // Дневной лимит озвучки исчерпан (HTTP 403 от /tts/synthesize) —
    // отдельная от обычной ERROR фаза: орб не анимируется вообще (просто
    // статично красный), и вместо мимолётного текста статуса показывается
    // модальное окно с явным объяснением (см. VoiceModeOverlay.jsx).
    LIMIT: 'limit',
};

// Сколько держим предупреждение «лимит исчерпан» персистентным между
// заходами в Voice Mode, если пользователь закрыл и открыл снова, не
// дожидаясь реального сброса лимита на бэкенде. Ровно та же цифра, что и
// в тексте самой ошибки от сервера («Обновится через 6 часов») — см.
// tts.controller.ts/consumeTtsLimit. Это эвристика: реальный сброс
// привязан к календарным суткам на бэкенде, а не к моменту исчерпания,
// но для UX «не пускать в разговор, если недавно уже упёрлись в лимит»
// этого достаточно — как только реально настанет новый день, первая же
// попытка озвучить всё равно успешно пройдёт на бэкенде, и флаг ниже
// корректно спишется при следующем успешном tts.speak().
const LIMIT_WARNING_TTL_MS = 6 * 60 * 60 * 1000;

// Крошечный беззвучный WAV, закодированный в data URI. Voice Mode
// открывается по клику (жест пользователя есть), но реальный audio.play()
// для голосового ответа ИИ происходит намного позже — после round-trip'а
// распознавания речи и запроса к LLM, уже вне «свежего» жеста. На части
// браузеров в этот момент срабатывает политика автовоспроизведения
// (play() падает с NotAllowedError) — именно это давало ощущение «Сара уже
// говорит, а звука нет» и ошибку «Не удалось воспроизвести аудио».
// Проигрывая беззвучный клип ПРЯМО ВНУТРИ клика, который открывает Voice
// Mode, мы один раз «размораживаем» программное воспроизведение аудио на
// этой странице на всю оставшуюся сессию — штатный, поддерживаемый
// браузерами приём (не обход политики, а её штатное использование).
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function unlockAudioPlayback() {
    try {
        const a = new Audio(SILENT_WAV);
        a.volume = 0;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* тихо игнорируем — не критично, просто попытка */ });
    } catch { /* noop */ }
}

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
        if (tts.limitExceeded) {
            // Отдельная ветка — лимит, не обычная ошибка (см. LIMIT выше).
            // Останавливаем прослушивание: продолжать разговор всё равно
            // бессмысленно, пока лимит не сбросится, а фоновая запись зря
            // жгла бы микрофон и путала пользователя, отвечая тишиной.
            recognition.stop();
            setErrorMsg(tts.error);
            setPhaseBoth(VOICE_MODE_PHASE.LIMIT);
            updateState({ ttsLimitExhaustedAt: Date.now() });
            return;
        }
        setErrorMsg(tts.error);
        setPhaseBoth(VOICE_MODE_PHASE.ERROR);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tts.error, tts.limitExceeded, active, setPhaseBoth]);

    const open = useCallback(() => {
        // Разблокируем автовоспроизведение аудио ПРЯМО в этом клике — до
        // любых await, см. комментарий у unlockAudioPlayback выше. Это и
        // есть основной фикс проблемы «не слышу ИИ»/«не удалось
        // воспроизвести аудио».
        unlockAudioPlayback();

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

        // Задача 2: если недавно (см. LIMIT_WARNING_TTL_MS) уже упирались в
        // дневной лимит озвучки — сразу показываем предупреждение повторно,
        // даже не пытаясь начать слушать. Реальный сброс на бэкенде
        // привязан к календарным суткам — если он уже произошёл, флаг
        // просто устареет (см. TTL-проверку ниже) и разговор пойдёт как
        // обычно.
        const exhaustedAt = state.ttsLimitExhaustedAt;
        if (exhaustedAt && Date.now() - exhaustedAt < LIMIT_WARNING_TTL_MS) {
            setErrorMsg('Дневной лимит озвучки исчерпан. Попробуй позже.');
            setPhaseBoth(VOICE_MODE_PHASE.LIMIT);
            return;
        }
        if (exhaustedAt) updateState({ ttsLimitExhaustedAt: null });

        setPhaseBoth(VOICE_MODE_PHASE.IDLE);
        // Слушаем сразу — без тапа по орбу.
        recognition.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedModelId, state.ttsLimitExhaustedAt, updateState, setPhaseBoth]);

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
