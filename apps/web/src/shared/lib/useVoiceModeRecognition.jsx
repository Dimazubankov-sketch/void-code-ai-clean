import { useCallback, useEffect, useRef } from 'react';

// ==========================================
// useVoiceModeRecognition — распознавание речи БЕЗ нажатий
// ==========================================
// Отдельный от useVoiceRecorder.jsx хук — тот сделан под другую модель
// взаимодействия (явный тап «начать/закончить» для диктовки в поле ввода).
//
// Ключевые правки этого раунда (по жалобам на «сырость» режима):
//   • pause()/resume() — во время речи Сары распознавание ОСТАНАВЛИВАЕТСЯ,
//     а микрофонный поток остаётся жив. Без этого Сару слышал собственный
//     микрофон (эхоподавление помогает, но не спасает на громкой связи),
//     её же слова попадали в распознавание и обрывали её на полуслове —
//     ровно то, на что жаловался пользователь. Перебивание теперь ловится
//     не по тексту, а по УРОВНЮ сигнала (см. analyserRef + useVoiceMode).
//   • MAX_UTTERANCE_MS — жёсткий предохранитель от зависания в «Слушаю…»:
//     если распознавание что-то услышало, но финал так и не пришёл,
//     фраза всё равно закрывается по таймауту.
//   • SILENCE_MS снижен — меньше «мёртвого» ожидания после того, как
//     пользователь договорил.

const SILENCE_MS = 700;        // было 1100 — пауза после речи до отправки
const MAX_UTTERANCE_MS = 12000; // предохранитель: максимум одна фраза
const MIN_UTTERANCE_CHARS = 2;  // отсекаем случайные «а», щелчки, шум

export function useVoiceModeRecognition({ lang = 'ru-RU', onUtterance, onSpeechActivity }) {
    const recognitionRef = useRef(null);
    const hasRealApiRef = useRef(false);
    const bufferRef = useRef('');
    const interimRef = useRef('');
    const silenceTimerRef = useRef(null);
    const maxUtterTimerRef = useRef(null);
    const listeningRef = useRef(false); // хотим ли мы сейчас вообще слушать
    const pausedRef = useRef(false);    // временно молчим (говорит Сара)

    const onUtteranceRef = useRef(onUtterance);
    const onSpeechActivityRef = useRef(onSpeechActivity);
    onUtteranceRef.current = onUtterance;
    onSpeechActivityRef.current = onSpeechActivity;

    // Микрофонный поток + анализатор уровня. Живёт всё время, пока Voice
    // Mode открыт (в т.ч. пока распознавание на паузе) — именно по нему
    // ловится перебивание во время речи Сары.
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const audioStreamRef = useRef(null);

    const startLevelMeter = useCallback(async () => {
        if (audioCtxRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            audioStreamRef.current = stream;
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            audioCtxRef.current = ctx;
            if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.55;
            source.connect(analyser);
            analyserRef.current = analyser;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.debug('[useVoiceModeRecognition] getUserMedia недоступен:', e?.message);
        }
    }, []);

    const stopLevelMeter = useCallback(() => {
        try { audioStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        try { audioCtxRef.current?.close(); } catch { /* noop */ }
        audioStreamRef.current = null;
        audioCtxRef.current = null;
        analyserRef.current = null;
    }, []);

    const clearTimers = useCallback(() => {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (maxUtterTimerRef.current) { clearTimeout(maxUtterTimerRef.current); maxUtterTimerRef.current = null; }
    }, []);

    const finalizeUtterance = useCallback(() => {
        clearTimers();
        const pending = interimRef.current.trim();
        if (pending) bufferRef.current = (bufferRef.current + ' ' + pending).trim();
        interimRef.current = '';
        const text = bufferRef.current.trim();
        bufferRef.current = '';
        // Слишком короткий результат — это почти всегда шум/щелчок, а не
        // реплика. Отдаём пустоту, чтобы Voice Mode вернулся в покой,
        // а не отправлял мусор в чат.
        if (text.length >= MIN_UTTERANCE_CHARS) onUtteranceRef.current?.(text);
        else onUtteranceRef.current?.('');
    }, [clearTimers]);

    const armTimers = useCallback(() => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(finalizeUtterance, SILENCE_MS);
        // Предохранитель ставим один раз на фразу, не сбрасывая его при
        // каждом слове — иначе долгая непрерывная речь могла бы держать
        // режим в «Слушаю…» бесконечно.
        if (!maxUtterTimerRef.current) {
            maxUtterTimerRef.current = setTimeout(finalizeUtterance, MAX_UTTERANCE_MS);
        }
    }, [finalizeUtterance]);

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { hasRealApiRef.current = false; return undefined; }
        hasRealApiRef.current = true;

        const rec = new SR();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = true;
        rec.maxAlternatives = 1;

        rec.onresult = (e) => {
            // На паузе (говорит Сара) игнорируем всё, что услышали —
            // с высокой вероятностью это её собственный голос из динамика.
            if (pausedRef.current) return;
            let finalText = '';
            let interimText = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const res = e.results[i];
                if (res.isFinal) finalText += res[0].transcript;
                else interimText += res[0].transcript;
            }
            if (finalText.trim()) {
                bufferRef.current = (bufferRef.current + ' ' + finalText.trim()).trim();
                interimRef.current = '';
            } else {
                interimRef.current = interimText;
            }
            if (finalText.trim() || interimText.trim()) {
                onSpeechActivityRef.current?.();
                armTimers();
            }
        };

        rec.onend = () => {
            // continuous:true всё равно иногда останавливается браузером сам —
            // если мы всё ещё должны слушать, перезапускаем без паузы, чтобы
            // разговор ощущался непрерывным, а не «отваливался» тихо.
            if (listeningRef.current && !pausedRef.current) {
                try { rec.start(); } catch { /* уже запущено — ок, игнорируем */ }
            }
        };

        rec.onerror = (e) => {
            // 'no-speech' / 'aborted' — штатные ситуации, не ошибки.
            if (e?.error === 'no-speech' || e?.error === 'aborted') return;
        };

        recognitionRef.current = rec;
        return () => {
            listeningRef.current = false;
            clearTimers();
            try { rec.abort(); } catch { /* noop */ }
            stopLevelMeter();
        };
    }, [lang, armTimers, clearTimers, stopLevelMeter]);

    const start = useCallback(() => {
        listeningRef.current = true;
        pausedRef.current = false;
        bufferRef.current = '';
        interimRef.current = '';
        clearTimers();
        startLevelMeter();
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch { /* уже запущено — ок */ }
        }
    }, [startLevelMeter, clearTimers]);

    const stop = useCallback(() => {
        listeningRef.current = false;
        pausedRef.current = false;
        clearTimers();
        bufferRef.current = '';
        interimRef.current = '';
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { /* noop */ }
        }
        stopLevelMeter();
    }, [clearTimers, stopLevelMeter]);

    // Пауза на время речи Сары: распознавание глушим, микрофон и
    // анализатор оставляем живыми (по ним ловим перебивание по уровню).
    const pause = useCallback(() => {
        if (pausedRef.current) return;
        pausedRef.current = true;
        clearTimers();
        bufferRef.current = '';
        interimRef.current = '';
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { /* noop */ }
        }
    }, [clearTimers]);

    const resume = useCallback(() => {
        if (!listeningRef.current) return;
        pausedRef.current = false;
        bufferRef.current = '';
        interimRef.current = '';
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch { /* уже запущено — ок */ }
        }
    }, []);

    // Принудительно завершить текущую фразу прямо сейчас, не дожидаясь
    // тишины — используется опциональным тапом по орбу.
    const finalizeNow = useCallback(() => { finalizeUtterance(); }, [finalizeUtterance]);

    return { supported: true, start, stop, pause, resume, finalizeNow, analyserRef };
}
