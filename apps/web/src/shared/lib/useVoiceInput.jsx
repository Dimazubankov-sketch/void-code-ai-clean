import { useEffect, useRef, useState } from 'react';

// ==========================================
// useVoiceInput — голосовой ввод (Speech-to-Text)
// ==========================================
// Обёртка над Web Speech API. Ключевые моменты:
//  • continuous = true — распознавание не обрывается на паузах, поэтому текст
//    появляется по ходу речи, а не «пачкой» в самом конце;
//  • промежуточный текст (interim) отдаётся наружу для «живой» анимации;
//  • при остановке недосказанный кусок не теряется: он дописывается в поле.
// Работает в браузерах с webkitSpeechRecognition (Chrome, Edge, Яндекс).

export function useVoiceInput(onResult, lang = 'ru-RU') {
    const [listening, setListening] = useState(false);
    const [supported, setSupported] = useState(false);
    const [interim, setInterim] = useState('');

    const recognitionRef = useRef(null);
    const onResultRef = useRef(onResult);
    const interimRef = useRef('');          // последний промежуточный текст
    const manualStopRef = useRef(false);    // остановка кнопкой, а не сама по себе
    const listeningRef = useRef(false);
    onResultRef.current = onResult;

    // Дописать в поле то, что осталось нераспознанным «начисто»
    const flushInterim = () => {
        const pending = interimRef.current.trim();
        interimRef.current = '';
        setInterim('');
        if (pending) onResultRef.current?.(pending);
    };

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setSupported(false); return; }
        setSupported(true);

        const rec = new SR();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = true;      // не обрывать на паузах — убирает задержку
        rec.maxAlternatives = 1;

        rec.onresult = (e) => {
            let finalText = '';
            let interimText = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const res = e.results[i];
                if (res.isFinal) finalText += res[0].transcript;
                else interimText += res[0].transcript;
            }
            // Финальные куски сразу отправляем в поле ввода
            if (finalText.trim()) {
                interimRef.current = '';
                setInterim('');
                onResultRef.current?.(finalText.trim());
            } else {
                interimRef.current = interimText;
                setInterim(interimText);
            }
        };

        rec.onend = () => {
            // Браузер может сам остановить распознавание — если пользователь не
            // жал кнопку, продолжаем слушать, чтобы речь не обрывалась.
            if (listeningRef.current && !manualStopRef.current) {
                try { rec.start(); return; } catch { /* noop */ }
            }
            flushInterim();
            listeningRef.current = false;
            manualStopRef.current = false;
            setListening(false);
        };

        rec.onerror = (e) => {
            // no-speech и aborted — штатные ситуации, не роняем сессию молча
            if (e?.error === 'no-speech' && listeningRef.current && !manualStopRef.current) return;
            flushInterim();
            listeningRef.current = false;
            setListening(false);
        };

        recognitionRef.current = rec;
        return () => {
            listeningRef.current = false;
            manualStopRef.current = true;
            try { rec.abort(); } catch { /* noop */ }
        };
    }, [lang]);

    const toggle = () => {
        const rec = recognitionRef.current;
        if (!rec) return;
        if (listeningRef.current) {
            manualStopRef.current = true;
            listeningRef.current = false;
            try { rec.stop(); } catch { /* noop */ }
            flushInterim();          // ничего не теряем при остановке
            setListening(false);
            return;
        }
        interimRef.current = '';
        setInterim('');
        manualStopRef.current = false;
        try {
            rec.start();
            listeningRef.current = true;
            setListening(true);
        } catch { /* noop */ }
    };

    return { listening, supported, interim, toggle };
}
