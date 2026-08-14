import { useCallback, useEffect, useRef } from 'react';

// ==========================================
// useVoiceModeRecognition — распознавание речи БЕЗ нажатий
// ==========================================
// Отдельный от useVoiceRecorder.jsx хук — тот сделан под другую модель
// взаимодействия (явный тап «начать/закончить» для диктовки в поле ввода).
// Здесь микрофон слушает непрерывно, пока Voice Mode открыт:
//   • speechActivity — вызывается на КАЖДЫЙ промежуточный кусок речи (в т.ч.
//     пока Сара говорит) — это и есть сигнал «перебить», которым пользуется
//     useVoiceMode.jsx.
//   • silenceMs после последней услышанной речи — фраза считается
//     законченной, накопленный текст уходит в onUtterance и отправляется.
// Работает через тот же Web Speech API, что и диктовка (требует HTTPS).

const SILENCE_MS = 1100; // тишина после речи, после которой считаем фразу законченной

export function useVoiceModeRecognition({ lang = 'ru-RU', onUtterance, onSpeechActivity }) {
    const recognitionRef = useRef(null);
    const hasRealApiRef = useRef(false);
    const bufferRef = useRef('');
    const interimRef = useRef('');
    const silenceTimerRef = useRef(null);
    const listeningRef = useRef(false); // хотим ли мы сейчас вообще слушать

    const onUtteranceRef = useRef(onUtterance);
    const onSpeechActivityRef = useRef(onSpeechActivity);
    onUtteranceRef.current = onUtterance;
    onSpeechActivityRef.current = onSpeechActivity;

    // Уровень микрофона для визуализации орба — тот же паттерн, что и в
    // useVoiceRecorder.jsx (отдельный getUserMedia+AnalyserNode, ничего
    // общего с воспроизведением звука — безопасно). echoCancellation
    // включён явно: снижает (не гарантированно убирает) риск того, что
    // микрофон уловит голос самой Сары из динамиков как «речь пользователя».
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const audioStreamRef = useRef(null);

    const startLevelMeter = useCallback(async () => {
        if (audioCtxRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
            });
            audioStreamRef.current = stream;
            const AC = window.AudioContext || window.webkitAudioContext;
            const ctx = new AC();
            audioCtxRef.current = ctx;
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

    const clearSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    }, []);

    const finalizeUtterance = useCallback(() => {
        clearSilenceTimer();
        const pending = interimRef.current.trim();
        if (pending) bufferRef.current = (bufferRef.current + ' ' + pending).trim();
        interimRef.current = '';
        const text = bufferRef.current.trim();
        bufferRef.current = '';
        if (text) onUtteranceRef.current?.(text);
    }, [clearSilenceTimer]);

    const armSilenceTimer = useCallback(() => {
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(finalizeUtterance, SILENCE_MS);
    }, [clearSilenceTimer, finalizeUtterance]);

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
                armSilenceTimer();
            }
        };

        rec.onend = () => {
            // continuous:true всё равно иногда останавливается браузером сам —
            // если мы всё ещё должны слушать, перезапускаем без паузы, чтобы
            // разговор ощущался непрерывным, а не «отваливался» тихо.
            if (listeningRef.current) {
                try { rec.start(); } catch { /* уже запущено — ок, игнорируем */ }
            }
        };

        rec.onerror = (e) => {
            // 'no-speech' — штатная ситуация (просто тишина), не ошибка.
            if (e?.error === 'no-speech') return;
        };

        recognitionRef.current = rec;
        return () => {
            listeningRef.current = false;
            clearSilenceTimer();
            try { rec.abort(); } catch { /* noop */ }
            stopLevelMeter();
        };
    }, [lang, armSilenceTimer, clearSilenceTimer, stopLevelMeter]);

    const start = useCallback(() => {
        listeningRef.current = true;
        bufferRef.current = '';
        interimRef.current = '';
        startLevelMeter();
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch { /* уже запущено — ок */ }
        }
    }, [startLevelMeter]);

    const stop = useCallback(() => {
        listeningRef.current = false;
        clearSilenceTimer();
        bufferRef.current = '';
        interimRef.current = '';
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { /* noop */ }
        }
        stopLevelMeter();
    }, [clearSilenceTimer, stopLevelMeter]);

    // Принудительно завершить текущую фразу прямо сейчас, не дожидаясь
    // тишины — используется опциональным тапом по орбу.
    const finalizeNow = useCallback(() => {
        finalizeUtterance();
    }, [finalizeUtterance]);

    return { supported: true, start, stop, finalizeNow, analyserRef };
}
