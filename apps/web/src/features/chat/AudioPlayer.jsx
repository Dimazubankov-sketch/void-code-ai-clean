import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AudioPlayer — компактный плеер озвучки
// ==========================================
// Управляет воспроизведением TTS: пауза/возобновление, перемотка ±15 сек,
// прогресс и закрытие. Логика синтеза — в переданном объекте tts
// (useTextToSpeech), плеер только рисует и вызывает его методы.

const fmt = (sec) => {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export function AudioPlayer({ tts, onClose }) {
    const { speaking, paused, elapsed, duration, pause, resume, seek } = tts;
    const progress = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
    const isPlaying = speaking && !paused;

    return (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-darkBorder max-w-md fade-in">
            <button onClick={() => seek(-15)} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0" title="Назад 15 сек"><Icons.Rewind15 className="w-4 h-4" /></button>
            <button onClick={() => isPlaying ? pause() : resume()} className="w-9 h-9 rounded-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white flex items-center justify-center shrink-0 transition-colors" title={isPlaying ? 'Пауза' : 'Продолжить'}>
                {isPlaying ? <Icons.Pause className="w-4 h-4" /> : <Icons.Play className="w-4 h-4" />}
            </button>
            <button onClick={() => seek(15)} className="p-1.5 rounded-lg text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0" title="Вперёд 15 сек"><Icons.Forward15 className="w-4 h-4" /></button>

            <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full bg-[#5b32d4] transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{fmt(elapsed)} / {fmt(duration)}</span>
            </div>

            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0" title="Закрыть"><Icons.X className="w-4 h-4" /></button>
        </div>
    );
}
