import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceModeRecognition } from '@/shared/lib/useVoiceModeRecognition';
import { useVoiceModeSpeech } from '@/shared/lib/useVoiceModeSpeech';
import { playVoiceModeOpenChime, playVoiceModeCloseChime } from '@/shared/lib/voiceModeChime';
import { createBackendChat, streamVoiceMessage } from '@/shared/api/chat';
import { detectEmotionCommand } from '@/shared/config/voiceEmotions';
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
    // Видеоконтекст разговора: камера или демонстрация экрана. Держим
    // живой поток и снимаем с него КАДР в момент отправки реплики —
    // непрерывно слать видео в модель и дорого, и незачем: вопрос всегда
    // привязан к тому, что в кадре именно сейчас.
    const videoStreamRef = useRef(null);
    const videoElRef = useRef(null);
    const [videoSource, setVideoSource] = useState(null); // 'camera' | 'screen' | null
    // Сам поток отдаём наружу, чтобы оверлей мог показать превью, не
    // запрашивая у браузера второе разрешение на камеру/экран.
    const [videoStream, setVideoStream] = useState(null);
    // Какая камера сейчас активна: 'environment' (основная) или 'user'
    // (фронтальная). Нужна отдельная память — getUserMedia не сообщает
    // выбранную сторону обратно.
    const facingRef = useRef('environment');
    // Параметры голоса фиксируются ОДИН РАЗ при входе в режим. Раньше
    // voiceOpts() вызывался на каждую реплику и читал state, где голос мог
    // быть ещё не выбран явно (voicePresetFish пустой) — тогда на бэкенд
    // уходил undefined, Fish брал голос по умолчанию, и от реплики к
    // реплике голос менялся. Теперь одна сессия — один голос.
    const sessionVoiceRef = useRef(null);
    // ВРЕМЕННАЯ эмоция текущей сессии: ставится голосовой командой
    // («говори спокойнее»), живёт только до закрытия Voice Mode и НЕ
    // трогает сохранённые настройки пользователя. При новом входе в
    // режим обнуляется (см. open) — как и требует задача.
    const sessionEmotionRef = useRef(null);
    const sessionVoiceOpts = useCallback(() => ({
        // Голос заморожен на сессию (иначе «плавал» между репликами),
        // а эмоция берётся актуальная: временная команда должна
        // подействовать сразу со следующей фразы.
        ...(sessionVoiceRef.current || voiceOpts()),
        ...(sessionEmotionRef.current ? voiceOpts(sessionEmotionRef.current) : {}),
    }), [voiceOpts]);

    const speech = useVoiceModeSpeech();

    // Снять текущий кадр в data-URL. Возвращает null, если видео не
    // подключено или кадр ещё не готов.
    const captureFrame = useCallback(() => {
        const video = videoElRef.current;
        if (!video || !video.videoWidth) return null;
        try {
            const maxW = 960; // больше модели не нужно, а трафик экономим
            const scale = Math.min(1, maxW / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.7);
        } catch { return null; }
    }, []);

    const stopVideo = useCallback(() => {
        try { videoStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        videoStreamRef.current = null;
        setVideoStream(null);
        if (videoElRef.current) {
            try { videoElRef.current.srcObject = null; videoElRef.current.remove(); } catch { /* noop */ }
        }
        videoElRef.current = null;
        setVideoSource(null);
    }, []);

    // Включить камеру или демонстрацию экрана. Повторный вызов того же
    // источника выключает его (кнопка работает как переключатель).
    const startVideo = useCallback(async (source) => {
        if (videoSource === source) { stopVideo(); return; }
        stopVideo();
        try {
            const stream = source === 'screen'
                ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
                : await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current }, audio: false });
            videoStreamRef.current = stream;
            setVideoStream(stream);
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            // Видео ОБЯЗАТЕЛЬНО должно быть в DOM: у полностью отсоединённого
            // элемента часть браузеров не начинает декодирование, и
            // videoWidth остаётся 0 — кадр тогда снять невозможно, ИИ
            // «не видит» ни камеру, ни экран. Прячем его вне области
            // видимости, а не через display:none (скрытое таким образом
            // видео браузер тоже вправе не декодировать).
            video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
            document.body.appendChild(video);
            await video.play().catch(() => { /* noop */ });
            // Ждём первый готовый кадр, иначе первый же captureFrame вернёт пустоту.
            if (!video.videoWidth) {
                await new Promise((resolve) => {
                    const done = () => resolve();
                    video.addEventListener('loadeddata', done, { once: true });
                    setTimeout(done, 1500);
                });
            }
            videoElRef.current = video;
            setVideoSource(source);
            // Пользователь может остановить демонстрацию системной кнопкой
            // браузера — тогда поток «умирает» сам, надо сбросить состояние.
            stream.getVideoTracks()[0]?.addEventListener('ended', () => stopVideo());
        } catch {
            stopVideo();
            setErrorMsg(source === 'screen' ? 'Не удалось начать демонстрацию экрана' : 'Нет доступа к камере');
            // РАНЬШЕ здесь менялся только errorMsg, а statusText в оверлее
            // показывает errorMsg ТОЛЬКО когда phase === ERROR — из-за этого
            // отказ в доступе к камере/экрану (запрет разрешения, небезопасный
            // контекст без HTTPS, отсутствие устройства) был полностью не
            // виден пользователю: кнопка нажималась, ничего не происходило,
            // выглядело как «не работает». Phase ERROR сам восстановится до
            // LISTENING при следующей реплике — та же логика, что и у прочих
            // ошибок голосового режима (см. resume/recognition выше).
            setPhaseBoth(VOICE_MODE_PHASE.ERROR);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoSource, stopVideo, setPhaseBoth]);

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

        // «Говори спокойнее / позитивнее / серьёзнее …» — меняем подачу
        // ТОЛЬКО на эту сессию. Команду всё равно отправляем модели: она
        // часть разговора, и ответ на неё должен прозвучать уже новым тоном.
        const cmd = detectEmotionCommand(text);
        if (cmd) sessionEmotionRef.current = cmd;
        if (phaseRef.current === VOICE_MODE_PHASE.THINKING) return;
        setPhaseBoth(VOICE_MODE_PHASE.THINKING);

        // Глушим распознавание ДО первого звука ответа — иначе микрофон
        // услышит Сару и сработает ложное перебивание.
        recognition.pause();

        const controller = new AbortController();
        streamAbortRef.current = controller;
        const stream = speech.beginStream(sessionVoiceOpts());
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
            // Кадр с камеры/экрана, если видео включено — модель увидит,
            // о чём именно идёт речь.
            const frame = captureFrame();
            const full = await streamVoiceMessage(chatId, text, {
                persona: persona?.instructions || undefined,
                image: frame || undefined,
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
        // Задача 6: голосовой режим — одна из функций, доступных только
        // после входа/регистрации. Гостю показываем модалку вместо запуска
        // микрофона/сессии — тот же паттерн, что и у handleSendMessage /
        // handleGenerateImage в App.jsx.
        if (!stateRef.current.user) {
            updateState({ showAuthModal: true });
            return;
        }
        // Оба вызова — синхронно внутри жеста пользователя: и «прогрев»
        // аудиоэлемента под autoplay-политику, и WebAudio для звука входа.
        speech.unlock();
        if (state.voiceModeSounds !== false) playVoiceModeOpenChime();

        savedModelIdRef.current = state.selectedModelId;
        if (state.selectedModelId !== 'flash') updateState({ selectedModelId: 'flash' });

        // Фиксируем голос сессии. Если явный голос ещё не выбран, берём
        // текущие настройки как есть — важно, что дальше он не меняется.
        sessionVoiceRef.current = voiceOpts();
        // Новая сессия — временная эмоция прошлой сессии сбрасывается.
        sessionEmotionRef.current = null;

        // Из Хаба голосовой разговор начинается в НОВОМ чате (иначе реплики
        // улетали бы в последний открытый). Из чата — продолжаем тот, в
        // котором пользователь уже находится.
        const prevState = stateRef.current;
        if (prevState.currentView !== 'chat' || !prevState.activeChatId) {
            const nid = Date.now();
            updateState({
                chatSessions: [{ id: nid, title: 'Голосовой разговор', messages: [] }, ...(prevState.chatSessions || [])],
                activeChatId: nid,
                currentView: 'chat',
            });
        }

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
        stopVideo();
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

    // Переключить фронтальную/основную камеру: просто перезапрашиваем
    // поток с другим facingMode — менять его у живого трека браузеры
    // поддерживают неровно, а пересоздание работает везде одинаково.
    const flipCamera = useCallback(async () => {
        if (videoSource !== 'camera') return;
        facingRef.current = facingRef.current === 'environment' ? 'user' : 'environment';
        const stream = videoStreamRef.current;
        // stopVideo() сбросил бы videoSource и закрыл режим камеры,
        // поэтому глушим прежний поток вручную и сразу берём новый.
        try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        try {
            const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current }, audio: false });
            videoStreamRef.current = next;
            setVideoStream(next);
            if (videoElRef.current) {
                videoElRef.current.srcObject = next;
                await videoElRef.current.play().catch(() => { /* noop */ });
            }
        } catch {
            setErrorMsg('Не удалось переключить камеру');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoSource]);

    // Повторно озвучить уже сказанный ответ (кнопка у сообщения в чате,
    // когда голосовой режим свёрнут).
    const replay = useCallback((text) => {
        if (!text) return;
        recognition.pause();
        setPhaseBoth(VOICE_MODE_PHASE.SPEAKING);
        speech.speak(text, sessionVoiceOpts());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setPhaseBoth, voiceOpts]);

    return {
        active, phase, muted, errorMsg,
        videoSource, videoStream, startVideo, stopVideo, flipCamera, replay,
        open, close, primaryTap, toggleMute,
        analyserRef: recognition.analyserRef,
        speechAudioRef: speech.audioRef,
        speechEnvelopeRef: speech.envelopeRef,
    };
}
