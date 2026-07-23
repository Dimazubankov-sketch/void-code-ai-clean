import { useState } from 'react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ChatToolbar — панель действий под ответом ИИ
// ==========================================
// Копировать (со всплывашкой «Скопировано»), Поделиться, Лайк, Дизлайк,
// Озвучить. Логика фидбэка/шеринга/озвучки передаётся колбэками сверху, чтобы
// компонент оставался чисто презентационным и переиспользуемым.

function ToolbarButton({ icon: IconC, label, onClick, active, activeColor }) {
    return (
        <button onClick={onClick} title={label} className={`p-1.5 rounded-lg transition-colors ${active ? activeColor : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            <IconC className="w-4 h-4" />
        </button>
    );
}

export function ChatToolbar({ text, onShare, onFeedback, onSpeak, speaking, feedbackValue }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text || '');
        } catch {
            // Фолбэк для старых браузеров
            const ta = document.createElement('textarea');
            ta.value = text || '';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch { /* noop */ }
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    };

    return (
        <div className="flex items-center gap-0.5 mt-1.5 relative">
            <ToolbarButton icon={Icons.Copy} label="Копировать" onClick={copy} />
            <ToolbarButton icon={Icons.Share} label="Поделиться" onClick={onShare} />
            <ToolbarButton icon={Icons.ThumbsUp} label="Хороший ответ" onClick={() => onFeedback('like')} active={feedbackValue === 'like'} activeColor="text-green-600 bg-green-50 dark:bg-green-900/20" />
            <ToolbarButton icon={Icons.ThumbsDown} label="Плохой ответ" onClick={() => onFeedback('dislike')} active={feedbackValue === 'dislike'} activeColor="text-red-500 bg-red-50 dark:bg-red-900/20" />
            <ToolbarButton icon={Icons.Volume2} label="Озвучить" onClick={onSpeak} active={speaking} activeColor="text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20" />

            {copied && (
                <span className="absolute -top-8 left-0 px-2.5 py-1 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-[11px] font-semibold shadow-lg void-copied-pop">Скопировано</span>
            )}
        </div>
    );
}
