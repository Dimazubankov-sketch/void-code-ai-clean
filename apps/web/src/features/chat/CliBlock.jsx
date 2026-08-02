import { useState } from 'react';
import { copyToCb } from '@/shared/lib/clipboard';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// CLI-виджет терминала (bash/sh)
// ==========================================
// Отображается прямо в чате вместо большого код-блока — для консольных
// команд это удобнее: пользователь видит команду сразу, копирует одной
// кнопкой, и не нужно открывать отдельное окно.
// Дизайн — под интерфейс Void Code: скруглённые углы, тёмный фон,
// «шапка» с тремя точками macOS-стиля и меткой SHELL, промпт ❯ перед каждой
// строкой команды.

export function CliBlock({ code, lang = 'bash' }) {
    const [copied, setCopied] = useState(false);
    const label = (lang || 'bash').toUpperCase();

    // Разбиваем на строки и убираем финальные пустые — чтобы не было
    // «дырки» внизу виджета, если модель добавила лишний \n.
    const lines = code.split('\n');
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();

    const handleCopy = () => {
        copyToCb(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="my-3 rounded-2xl overflow-hidden border border-gray-800 bg-[#0f0f1a] shadow-sm void-selectable">
            {/* Шапка терминала */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#181828] border-b border-gray-800/70">
                <div className="flex items-center gap-2 min-w-0">
                    {/* macOS-style точки */}
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                    <span className="ml-2 text-[10px] font-semibold tracking-wider text-gray-400 truncate">{label}</span>
                </div>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700/50 transition-colors flex-shrink-0"
                    title="Копировать команду"
                >
                    <Icons.Copy className="w-3.5 h-3.5" />
                    {copied ? 'Скопировано' : 'Копировать'}
                </button>
            </div>
            {/* Тело — промпт + команды. Разрешаем выделение (mobile long-press). */}
            <div className="px-4 py-3 overflow-x-auto">
                <pre className="text-[13px] leading-relaxed font-mono text-gray-100 whitespace-pre">
                    {lines.map((line, i) => (
                        <div key={i} className="flex gap-2">
                            <span className="text-[#5b32d4] select-none flex-shrink-0">❯</span>
                            <span className="break-all">{line || '\u00A0'}</span>
                        </div>
                    ))}
                </pre>
            </div>
        </div>
    );
}
