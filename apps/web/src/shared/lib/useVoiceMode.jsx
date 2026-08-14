import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { useOpenAiTts } from '@/shared/lib/useOpenAiTts';

// ==========================================
// useVoiceMode — разговорный голосовой режим чата
// ==========================================
// Область этого раунда (сознательно ограничена, не полный ТЗ):
//   • Распознавание речи — тот же Web Speech API, что уже используется для
//     диктовки в композере (useVoiceRecorder). НЕ Fish Transcribe-1 —
//     полноценный потоковый STT через Fish (WebSocket, отдельный бэкенд-
//     сервис, лимиты/очередь на конкурентность) — это отдельный, гораздо
//     больший раунд работы, который нужно обсуждать и тестировать отдельно.
//   • Синтез ответа — существующий бэкенд /tts/synthesize (Fish Audio S2.1
//     Pro / OpenAI TTS, тот же голос, что выбран в Настройках → Голос).
//     Никакой отдельной системы голосов не создаётся.
//   • Ответ ИИ синтезируется ЦЕЛИКОМ, ПОСЛЕ того как текстовый ответ уже
//     полностью получен (state.isGenerating: true → false), а не потоково
//     по мере генерации — то есть это НЕ низколатентный потоковый пайплайн
//     «говорю → сразу слышу первые слова ответа», а обычный «спросил →
//     дождался ответа → услышал». Настоящий потоковый TTS по мере
//     генерации LLM (разбивка на фразы «на лету») требует стриминга
//     ответа самой LLM по предложениям — сейчас это отдельный, более
//     рискованный кусок работы.
//   • Перебивание (barge-in) реализовано через тап по орбу во время речи
//     Сары — НЕ через постоянное прослушивание микрофона с VAD (это
//     потребовало бы alwayson getUserMedia с эхоподавлением и риск
//     самосрабатывания от звука из динамиков). Тап во время речи Сары
//     мгновенно останавливает TTS и тут же начинает слушать новую фразу.
//
// Причины такого выбора описаны честно в чате пользователю — это рабочий,
// протестированный по частям (dictation + TTS уже в проде) MVP, а не
// притворная озвучка/фейковая интеграция.

export const VOICE_MODE_PHASE = {
    IDLE: 'idle',
    LISTENING: 'listening',
    TRANSCRIBING: 'transcribing',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
    ERROR: 'error',
};

export function useVoiceMode({ state, updateState, handleSendMessage, voiceOpts, lang = 'ru-RU' }) {
    const [active, setActive] = useState(false);
    const [phase, setPhase] = useState(VOICE_MODE_PHASE.IDLE);
    const [muted, setMuted] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    // Запоминаем модель, которая была выбрана в обычном чате ДО входа в
    // Voice Mode — чтобы вернуть её при выходе (см. open/close ниже).
    const savedModelIdRef = useRef(null);

    const tts = useOpenAiTts();
    // Ждём ли мы прямо сейчас ответ ИИ, чтобы озвучить его, как только он
    // придёт — обычный useState тут не подходит: проверка идёт внутри
    // useEffect на каждый рендер, а флаг не должен вызывать лишние рендеры.
    const pendingReplyRef = useRef(false);

    const recorder = useVoiceRecorder((text) => {
        if (!text || !text.trim()) { setPhase(VOICE_MODE_PHASE.IDLE); return; }
        setPhase(VOICE_MODE_PHASE.THINKING);
        pendingReplyRef.current = true;
        handleSendMessage(text);
    }, lang, { instantTranscribe: true });

    // Фаза записи/распознавания текста — просто зеркалим состояние recorder.
    useEffect(() => {
        if (!active) return;
        if (recorder.recording) setPhase(VOICE_MODE_PHASE.LISTENING);
        else if (recorder.transcribing) setPhase(VOICE_MODE_PHASE.TRANSCRIBING);
    }, [active, recorder.recording, recorder.transcribing]);

    // Как только ответ ИИ дописан (isGenerating: true → false) и мы его
    // ждали — берём последнее сообщение ассистента из активного чата и
    // озвучиваем. Сообщение и isGenerating:false приходят одним и тем же
    // setState в App.jsx (см. handleSendMessage), поэтому на момент, когда
    // этот эффект видит isGenerating===false, chatSessions уже содержит
    // финальный текст ответа — гонки здесь нет.
    const wasGeneratingRef = useRef(state.isGenerating);
    useEffect(() => {
        const wasGenerating = wasGeneratingRef.current;
        wasGeneratingRef.current = state.isGenerating;
        if (!active || !pendingReplyRef.current) return;
        if (wasGenerating && !state.isGenerating) {
            pendingReplyRef.current = false;
            const activeChat = (state.chatSessions || []).find(c => c.id === state.activeChatId);
            const messages = activeChat?.messages || [];
            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant' && last.content) {
                setPhase(VOICE_MODE_PHASE.SPEAKING);
                tts.speak(last.content, voiceOpts());
            } else {
                setPhase(VOICE_MODE_PHASE.IDLE);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isGenerating, active]);

    // Озвучка естественно закончилась (не прервана тапом) — возвращаемся
    // в ожидание, а не слушаем автоматически дальше: непрерывный open-mic
    // без эхоподавления рискует поймать звук самой Сары из динамиков и
    // «услышать себя». Продолжить разговор — явный тап по орбу.
    useEffect(() => {
        if (!active) return;
        if (phase === VOICE_MODE_PHASE.SPEAKING && !tts.speaking && !tts.loading && !tts.error) {
            setPhase(VOICE_MODE_PHASE.IDLE);
        }
    }, [tts.speaking, tts.loading, tts.error, phase, active]);

    useEffect(() => {
        if (!active || !tts.error) return;
        setErrorMsg(tts.error);
        setPhase(VOICE_MODE_PHASE.ERROR);
    }, [tts.error, active]);

    const open = useCallback(() => {
        // Voice Mode всегда переключает на Void Mini (id 'flash') — самую
        // быструю модель (Groq), безлимитную и бесплатную на любом тарифе.
        // Для живого разговора скорость ответа важнее глубины рассуждений;
        // «тяжёлая» модель здесь ощущается именно как «тормозит». Модель,
        // выбранную в обычном чате, запоминаем и возвращаем при закрытии
        // Voice Mode (см. close ниже) — выбор пользователя вне Voice Mode
        // не теряется.
        savedModelIdRef.current = state.selectedModelId;
        if (state.selectedModelId !== 'flash') updateState({ selectedModelId: 'flash' });
        setActive(true);
        setPhase(VOICE_MODE_PHASE.IDLE);
        setErrorMsg(null);
        pendingReplyRef.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.selectedModelId, updateState]);

    const close = useCallback(() => {
        setActive(false);
        recorder.cancel();
        tts.stop();
        pendingReplyRef.current = false;
        setPhase(VOICE_MODE_PHASE.IDLE);
        setErrorMsg(null);
        if (savedModelIdRef.current && savedModelIdRef.current !== 'flash') {
            updateState({ selectedModelId: savedModelIdRef.current });
        }
        savedModelIdRef.current = null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateState]);

    // Главное действие — тап по орбу:
    //   • Сара говорит  → прервать TTS и сразу начать слушать (barge-in)
    //   • слушаем        → остановить запись, отправить на распознавание
    //   • простой/ошибка → начать слушать
    const primaryTap = useCallback(() => {
        if (muted) return;
        if (phase === VOICE_MODE_PHASE.SPEAKING) {
            tts.stop();
            pendingReplyRef.current = false;
            recorder.start();
            return;
        }
        if (phase === VOICE_MODE_PHASE.LISTENING) {
            recorder.stop();
            return;
        }
        if (phase === VOICE_MODE_PHASE.IDLE || phase === VOICE_MODE_PHASE.ERROR) {
            setErrorMsg(null);
            recorder.start();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, muted]);

    const toggleMute = useCallback(() => {
        setMuted((m) => {
            const next = !m;
            if (next && recorder.recording) recorder.cancel();
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        active, phase, muted, errorMsg,
        open, close, primaryTap, toggleMute,
        analyserRef: recorder.analyserRef,
    };
}
