import { useEffect, useRef, useState } from 'react';

// ==========================================
// useVoiceRecorder — запись голоса с фазой «Преобразование в текст»
// ==========================================
// UX микрофона в чатах:
//   idle → (клик по микрофону) → recording: поле ввода целиком занимает
//   анимация записи, «+» слева превращается в «×» (отмена), микрофон — в
//   квадратик (стоп);
//   recording → (клик по квадрату) → transcribing: квадрат становится
//   индикатором загрузки, в поле — плейсхолдер «Преобразование в текст»;
//   transcribing → (через ~2с) → idle: распознанный текст ДОБАВЛЯЕТСЯ к
//   тексту, уже находящемуся в поле ввода (повторная запись дописывает).
//   «×» в любой момент отменяет запись и отбрасывает распознанное.
//
// Технически: Web Speech API. Он требует HTTPS — на голом HTTP (или в
// браузерах без поддержки) реального распознавания не будет. Чтобы можно
// было отлаживать сами анимации микрофона уже сейчас, при отсутствии API
// включается ДЕМО-РЕЖИМ: кнопка микрофона показывается всегда, весь цикл
// анимаций (запись → «Преобразование в текст» → idle) проигрывается, только
// без вставки реального текста. Полноценное распознавание заработает само,
// как только сайт откроется по HTTPS.

export const VOICE_PHASE = {
    IDLE: 'idle',
    RECORDING: 'recording',
    TRANSCRIBING: 'transcribing',
};

export function useVoiceRecorder(onText, lang = 'ru-RU') {
    const [phase, setPhase] = useState(VOICE_PHASE.IDLE);

    const recognitionRef = useRef(null);
    const hasRealApiRef = useRef(false);   // есть ли реальный Web Speech API
    const onTextRef = useRef(onText);
    const bufferRef = useRef('');          // накопленный финальный текст
    const interimRef = useRef('');         // последний промежуточный кусок
    const phaseRef = useRef(VOICE_PHASE.IDLE);
    const stopModeRef = useRef(null);      // 'stop' (преобразовать) | 'cancel' (отбросить)
    const transcribeTimerRef = useRef(null);
    onTextRef.current = onText;

    const setPhaseBoth = (p) => { phaseRef.current = p; setPhase(p); };

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            // Реального API нет — работаем в демо-режиме (только анимации).
            hasRealApiRef.current = false;
            recognitionRef.current = null;
            return;
        }
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
        };

        rec.onend = () => {
            // Браузер может остановить распознавание сам — пока идёт запись
            // и пользователь не жал стоп/отмену, перезапускаем без пауз.
            if (phaseRef.current === VOICE_PHASE.RECORDING && !stopModeRef.current) {
                try { rec.start(); return; } catch { /* noop */ }
            }
            const mode = stopModeRef.current;
            stopModeRef.current = null;
            if (mode === 'stop') {
                // Недосказанный interim не теряем — дописываем в буфер
                const pending = interimRef.current.trim();
                if (pending) bufferRef.current = (bufferRef.current + ' ' + pending).trim();
                interimRef.current = '';
                // Фаза «Преобразование в текст»: индикатор крутится пару секунд
                setPhaseBoth(VOICE_PHASE.TRANSCRIBING);
                transcribeTimerRef.current = setTimeout(() => {
                    const text = bufferRef.current.trim();
                    bufferRef.current = '';
                    setPhaseBoth(VOICE_PHASE.IDLE);
                    if (text) onTextRef.current?.(text);
                }, 1800);
            } else {
                // Отмена крестиком или ошибка — всё отбрасываем
                bufferRef.current = '';
                interimRef.current = '';
                setPhaseBoth(VOICE_PHASE.IDLE);
            }
        };

        rec.onerror = (e) => {
            if (e?.error === 'no-speech' && phaseRef.current === VOICE_PHASE.RECORDING && !stopModeRef.current) return;
            if (phaseRef.current === VOICE_PHASE.RECORDING) {
                stopModeRef.current = stopModeRef.current || 'cancel';
            }
        };

        recognitionRef.current = rec;
        return () => {
            stopModeRef.current = 'cancel';
            phaseRef.current = VOICE_PHASE.IDLE;
            clearTimeout(transcribeTimerRef.current);
            try { rec.abort(); } catch { /* noop */ }
        };
    }, [lang]);

    // Клик по микрофону — начать запись
    const start = () => {
        if (phaseRef.current !== VOICE_PHASE.IDLE) return;
        bufferRef.current = '';
        interimRef.current = '';
        stopModeRef.current = null;
        if (hasRealApiRef.current && recognitionRef.current) {
            try {
                recognitionRef.current.start();
                setPhaseBoth(VOICE_PHASE.RECORDING);
            } catch { /* noop */ }
        } else {
            // Демо-режим: просто показываем анимацию записи
            setPhaseBoth(VOICE_PHASE.RECORDING);
        }
    };

    // Клик по квадрату — остановить и преобразовать в текст
    const stop = () => {
        if (phaseRef.current !== VOICE_PHASE.RECORDING) return;
        stopModeRef.current = 'stop';
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { recognitionRef.current.onend?.(); }
        } else {
            // Демо-режим: имитируем фазу «Преобразование в текст», затем idle.
            // Реального текста не вставляем — распознавания без HTTPS нет.
            setPhaseBoth(VOICE_PHASE.TRANSCRIBING);
            transcribeTimerRef.current = setTimeout(() => {
                setPhaseBoth(VOICE_PHASE.IDLE);
            }, 1800);
        }
    };

    // Клик по крестику — прервать запись, ничего не вставляя
    const cancel = () => {
        if (phaseRef.current !== VOICE_PHASE.RECORDING) return;
        stopModeRef.current = 'cancel';
        if (hasRealApiRef.current && recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch { /* noop */ }
        }
        bufferRef.current = '';
        interimRef.current = '';
        setPhaseBoth(VOICE_PHASE.IDLE);
    };

    return {
        // Кнопка микрофона показывается ВСЕГДА — даже без реального API,
        // чтобы были видны анимации (реальное распознавание включится на HTTPS).
        supported: true,
        phase,
        recording: phase === VOICE_PHASE.RECORDING,
        transcribing: phase === VOICE_PHASE.TRANSCRIBING,
        busy: phase !== VOICE_PHASE.IDLE,
        start,
        stop,
        cancel,
    };
}
