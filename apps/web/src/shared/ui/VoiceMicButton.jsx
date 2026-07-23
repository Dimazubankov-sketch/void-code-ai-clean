import { Icons } from '@/shared/ui/Icons';

// ==========================================
// VoiceMicButton — кнопка микрофона с анимацией записи
// ==========================================
// Единый вид микрофона во всех чатах: в покое — фиолетовый, при записи —
// заливка фирменным фиолетовым с пульсацией. Столбики-эквалайзер и
// промежуточный текст (interim) выводятся отдельно через VoiceListeningBars.

export function VoiceMicButton({ voice, size = 'md', className = '' }) {
    if (!voice.supported) return null;
    const dims = size === 'sm' ? 'w-10 h-10' : 'w-11 h-11';
    return (
        <button
            onClick={voice.toggle}
            title="Голосовой ввод"
            className={`${dims} rounded-xl flex items-center justify-center shrink-0 transition-colors ${voice.listening ? 'bg-[#5b32d4] text-white voice-pulse-purple' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-200 dark:hover:bg-gray-700'} ${className}`}
        >
            <Icons.Mic className="w-4 h-4" />
        </button>
    );
}

// Живой эквалайзер + промежуточный текст (для отображения в поле ввода)
export function VoiceListeningBars({ interim, compact = false }) {
    return (
        <span className={`flex items-center gap-2.5 ${compact ? 'text-sm' : 'text-[16px]'} truncate`}>
            <span className="flex items-end gap-0.5 h-4 shrink-0">
                <span className="voice-bar w-1 rounded-full bg-[#5b32d4]" style={{ animationDelay: '0ms' }} />
                <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '150ms' }} />
                <span className="voice-bar w-1 rounded-full bg-[#9d16e0]" style={{ animationDelay: '300ms' }} />
                <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '450ms' }} />
            </span>
            <span className="truncate text-gray-500 dark:text-gray-300">{interim || 'Слушаю…'}</span>
        </span>
    );
}
