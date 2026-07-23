import { useEffect, useRef, useState, useCallback } from 'react';

// ==========================================
// useTextToSpeech — озвучка текста (Text-to-Speech)
// ==========================================
// Обёртка над Web Speech API (speechSynthesis). Поддерживает play/pause,
// перемотку ±15 секунд и выбор голоса/языка. Так как Web Speech API не умеет
// перематывать напрямую, текст разбивается на слова, ведётся оценка позиции по
// времени, а перемотка перезапускает синтез с нужного слова.

const WORDS_PER_SEC = 2.6; // средняя скорость речи для оценки позиции

export function useTextToSpeech() {
    const [speaking, setSpeaking] = useState(false);
    const [paused, setPaused] = useState(false);
    const [supported, setSupported] = useState(false);
    const [voices, setVoices] = useState([]);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);

    const wordsRef = useRef([]);
    const startWordRef = useRef(0);
    const tickRef = useRef(null);
    const optsRef = useRef({ lang: 'ru-RU', voiceURI: null, rate: 1 });

    useEffect(() => {
        if (typeof window === 'undefined' || !window.speechSynthesis) { setSupported(false); return; }
        setSupported(true);
        const load = () => setVoices(window.speechSynthesis.getVoices());
        load();
        window.speechSynthesis.onvoiceschanged = load;
        return () => { window.speechSynthesis.onvoiceschanged = null; try { window.speechSynthesis.cancel(); } catch { /* noop */ } };
    }, []);

    const clearTick = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };

    const startTick = useCallback((baseWord) => {
        clearTick();
        const t0 = Date.now();
        tickRef.current = setInterval(() => {
            const spokenWords = baseWord + (Date.now() - t0) / 1000 * WORDS_PER_SEC;
            setElapsed(Math.min(spokenWords / WORDS_PER_SEC, duration));
        }, 200);
    }, [duration]);

    // Запуск синтеза с конкретного слова
    const speakFrom = useCallback((wordIndex) => {
        const synth = window.speechSynthesis;
        if (!synth) return;
        try { synth.cancel(); } catch { /* noop */ }
        const words = wordsRef.current;
        const clampedStart = Math.max(0, Math.min(wordIndex, words.length - 1));
        startWordRef.current = clampedStart;
        const text = words.slice(clampedStart).join(' ');
        if (!text) { setSpeaking(false); return; }
        const u = new SpeechSynthesisUtterance(text);
        const { lang, voiceURI, rate, pitch } = optsRef.current;
        u.lang = lang;
        u.rate = rate;
        if (pitch) u.pitch = pitch;
        const v = synth.getVoices().find(x => x.voiceURI === voiceURI);
        if (v) u.voice = v;
        u.onend = () => { setSpeaking(false); setPaused(false); clearTick(); setElapsed(duration); };
        u.onerror = () => { setSpeaking(false); setPaused(false); clearTick(); };
        synth.speak(u);
        setSpeaking(true);
        setPaused(false);
        startTick(clampedStart);
    }, [duration, startTick]);

    // Начать озвучку нового текста
    const speak = useCallback((text, opts = {}) => {
        optsRef.current = { lang: 'ru-RU', voiceURI: null, rate: 1, pitch: 1, ...opts };
        const words = (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        wordsRef.current = words;
        setDuration(words.length / WORDS_PER_SEC);
        setElapsed(0);
        speakFrom(0);
    }, [speakFrom]);

    const pause = useCallback(() => {
        const synth = window.speechSynthesis;
        if (!synth) return;
        if (speaking && !paused) { try { synth.pause(); } catch { /* noop */ } setPaused(true); clearTick(); }
    }, [speaking, paused]);

    const resume = useCallback(() => {
        const synth = window.speechSynthesis;
        if (!synth) return;
        if (speaking && paused) { try { synth.resume(); } catch { /* noop */ } setPaused(false); startTick(startWordRef.current + elapsed * WORDS_PER_SEC - startWordRef.current); }
    }, [speaking, paused, elapsed, startTick]);

    const stop = useCallback(() => {
        const synth = window.speechSynthesis;
        if (synth) { try { synth.cancel(); } catch { /* noop */ } }
        setSpeaking(false); setPaused(false); clearTick(); setElapsed(0);
    }, []);

    // Перемотка на ±секунды
    const seek = useCallback((deltaSec) => {
        const curWord = Math.round(elapsed * WORDS_PER_SEC);
        const targetWord = Math.round(curWord + deltaSec * WORDS_PER_SEC);
        setElapsed(Math.max(0, Math.min(targetWord / WORDS_PER_SEC, duration)));
        speakFrom(targetWord);
    }, [elapsed, duration, speakFrom]);

    return { supported, speaking, paused, voices, elapsed, duration, speak, pause, resume, stop, seek };
}
