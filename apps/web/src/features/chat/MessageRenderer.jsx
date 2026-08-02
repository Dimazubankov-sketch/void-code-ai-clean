import React from 'react';
import { copyToCb } from '@/shared/lib/clipboard';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// Безопасный рендер **bold**-фрагментов текста
// ==========================================
// ВАЖНО: никогда не использовать dangerouslySetInnerHTML для текста
// от ИИ — это не только риск XSS, но и конкретный баг, который был здесь:
// пока сообщение печаталось посимвольно (TypewriterMessage), незакрытый
// тройными кавычками код-блок (```html ...) на середине печати попадал
// в этот "обычный текст" путь и, будучи вставлен как реальный HTML,
// рендерился настоящими DOM-элементами (<div>, <header>, <nav>...)
// вместо видимого текста — так весь код "пропадал", оставляя только
// пустые строки. Теперь строка всегда рендерится как текст через React
// (безопасно и предсказуемо в любой момент печати).
function renderBoldLine(line, key) {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
        <React.Fragment key={key}>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                    return <strong key={i}>{part.slice(2, -2)}</strong>;
                }
                return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
        </React.Fragment>
    );
}

export function MessageRenderer({ content }) {
    const blocks = content.split(/(```[\s\S]*?```)/g);
    return (
        <div className="text-[16px] sm:text-[17px] leading-relaxed break-words">
            {blocks.map((block, index) => {
                if (block.startsWith('```') && block.endsWith('```') && block.length >= 6) {
                    const lines = block.slice(3, -3).split('\n');
                    const lang = lines[0].trim();
                    const code = lines.slice(1).join('\n');
                    return (
                        <div key={index} className="my-4 bg-[#1e1e2e] rounded-2xl overflow-hidden shadow-sm border border-gray-800">
                            <div className="flex justify-between items-center px-4 py-2 bg-[#2a2a3c] border-b border-gray-700/50">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{lang || 'code'}</span>
                                <button onClick={() => copyToCb(code)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                                    <Icons.Code /> Копировать
                                </button>
                            </div>
                            <div className="p-4 overflow-x-auto bg-[#1e1e2e]"><pre className="text-sm text-gray-200 font-mono"><code>{code}</code></pre></div>
                        </div>
                    );
                }
                // Незакрытый код-блок (ещё печатается) или обычный текст —
                // в обоих случаях рендерим как безопасный текст, без HTML-инъекции.
                const lines = block.split('\n');
                return (
                    <span key={index}>
                        {lines.map((line, i) => (
                            <React.Fragment key={i}>
                                {renderBoldLine(line, i)}
                                {i !== lines.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </span>
                );
            })}
        </div>
    );
}
