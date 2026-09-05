import { useEffect, useRef, useState } from 'react';
import { VoiceWaveMic } from '@/features/chat/VoiceWaveMic';

// ==========================================
// RecordingPill — волна + таймер записи (задача 6)
// ==========================================
// Раньше во время записи бары эквалайзера (VoiceWaveMic) занимали ВЕСЬ
// доступный отрезок поля ввода (просто flex-1 внутри полупрозрачной
// подложки) — ни явного контейнера, ни счётчика времени не было, всё
// выглядело как «просто бары висят в воздухе». Теперь волна и живой
// таймер (0:01, 0:15, 1:03…) собраны в один компактный «стеклянный»
// капсульный контейнер — так и выглядит собранно, и сразу видно, сколько
// уже длится запись (это то, чего не хватало по сравнению с привычными
// голосовыми сообщениями в мессенджерах).
export function RecordingPill({ voice, className = '' }) {
    const [elapsedMs, setElapsedMs] = useState(0);
    const startedAtRef = useRef(0);

    useEffect(() => {
        if (!voice.recording) { setElapsedMs(0); return undefined; }
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        const iv = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
        return () => clearInterval(iv);
    }, [voice.recording]);

    return (
        <div className={`flex items-center gap-3 px-4 py-2 rounded-full bg-white/70 dark:bg-black/25 backdrop-blur-md shadow-sm ${className}`}>
            <VoiceWaveMic analyserRef={voice.analyserRef} compact className="text-[#5b32d4] dark:text-purple-300" />
            <span className="text-xs font-bold text-[#5b32d4] dark:text-purple-300 tabular-nums shrink-0">
                {formatElapsed(elapsedMs)}
            </span>
        </div>
    );
}

function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
