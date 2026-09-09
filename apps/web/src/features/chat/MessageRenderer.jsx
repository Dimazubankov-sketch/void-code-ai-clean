import React from 'react';
import { copyToCb } from '@/shared/lib/clipboard';
import { Icons } from '@/shared/ui/Icons';
import { CliBlock } from '@/features/chat/CliBlock';
import { ChartBlock } from '@/features/chat/ChartBlock';
import { TableBlock } from '@/features/chat/TableBlock';

// Языки, которые считаем «CLI» и рисуем компактным виджетом терминала
// прямо в чате (см. CliBlock). Должен совпадать с INLINE_CLI_LANGS в
// shared/lib/documents.jsx — оба места фильтруют одни и те же языки.
const CLI_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'cmd', 'terminal', 'powershell', 'ps1']);
// Языки-виджеты для графиков — рендерятся ChartBlock'ом инлайном,
// НЕ уходят в «Библиотеку кода» и НЕ открываются в CodeViewerModal.
const CHART_LANGS = new Set(['chart', 'graph', 'plot', 'json-chart', 'linechart', 'barchart', 'chartjs', 'recharts']);

// ==========================================
// Безопасный рендер inline-форматирования (**bold**, `code`, *italic*)
// ==========================================
// ВАЖНО: никогда не использовать dangerouslySetInnerHTML для текста
// от ИИ — это не только риск XSS, но и конкретный баг, который был здесь:
// пока сообщение печаталось посимвольно, незакрытый тройными кавычками
// код-блок (```html ...) на середине печати попадал в этот "обычный
// текст" путь и, будучи вставлен как реальный HTML, рендерился настоящими
// DOM-элементами вместо видимого текста. Теперь строка всегда рендерится
// как текст через React (безопасно и предсказуемо в любой момент печати).
function renderInline(line, key) {
    // Разбиваем на **bold**, `inline code`, *italic* — по одному проходу.
    const parts = String(line).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g);
    return (
        <React.Fragment key={key}>
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                    return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
                    return (
                        <code key={i} className="px-1.5 py-0.5 mx-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[0.88em] font-mono text-[#5b32d4] dark:text-purple-300 align-baseline">
                            {part.slice(1, -1)}
                        </code>
                    );
                }
                if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
                    return <em key={i} className="italic">{part.slice(1, -1)}</em>;
                }
                return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
        </React.Fragment>
    );
}

// Обратная совместимость: renderBoldLine используется в других местах.
const renderBoldLine = renderInline;

// ==========================================
// Определители строк markdown
// ==========================================
function isTableSeparator(line) {
    if (!line.includes('|')) return false;
    const cells = line.split('|').map(s => s.trim()).filter(s => s !== '');
    if (cells.length === 0) return false;
    return cells.every(c => /^:?-{3,}:?$/.test(c));
}

function isPipeRow(line) {
    const pipes = (line.match(/\|/g) || []).length;
    return pipes >= 2;
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const isHeadingLine = (line) => HEADING_RE.test(line.trim());

// Горизонтальный разделитель: ---, ***, ___ (3+), на отдельной строке и
// без вертикальных чёрточек (иначе это разделитель таблицы).
const isHrLine = (line) => /^\s*([-*_])\1{2,}\s*$/.test(line) && !line.includes('|');

// Маркированный список: -, *, • (но не разделитель ---).
const UL_RE = /^(\s*)[-*•]\s+(.+)$/;
const isUlItem = (line) => UL_RE.test(line) && !isHrLine(line);
// Нумерованный список: 1. / 1)
const OL_RE = /^(\s*)(\d{1,3})[.)]\s+(.+)$/;
const isOlItem = (line) => OL_RE.test(line);
// Цитата: > текст
const QUOTE_RE = /^\s*>\s?(.*)$/;
const isQuoteLine = (line) => QUOTE_RE.test(line);

function renderHeadingLine(line, key) {
    const match = line.trim().match(HEADING_RE);
    const level = match[1].length;
    const text = match[2];
    const classes = {
        1: 'text-2xl font-bold mt-5 mb-2.5 leading-snug',
        2: 'text-xl font-bold mt-4 mb-2 leading-snug',
        3: 'text-lg font-bold mt-3 mb-1.5 leading-snug',
    }[level];
    const Tag = `h${level}`;
    return (
        <Tag key={key} className={`${classes} text-gray-900 dark:text-white`}>
            {renderInline(text, `${key}-h`)}
        </Tag>
    );
}

// Разбирает произвольный текст на блоки: text / table / heading / hr /
// ul / ol / quote. Списки и цитаты собираются из подряд идущих строк.
function splitBlocks(text) {
    const lines = text.split('\n');
    const chunks = [];
    let buffer = [];
    let i = 0;
    const flushText = () => {
        if (buffer.length) {
            // Не плодим пустые текстовые блоки из одних переводов строки.
            if (buffer.join('').trim() !== '') chunks.push({ type: 'text', text: buffer.join('\n') });
            buffer = [];
        }
    };
    while (i < lines.length) {
        const line = lines[i];
        const next = lines[i + 1];

        // Таблица
        if (isPipeRow(line) && next !== undefined && isTableSeparator(next)) {
            flushText();
            const tableLines = [line, next];
            let j = i + 2;
            while (j < lines.length && isPipeRow(lines[j])) { tableLines.push(lines[j]); j++; }
            chunks.push({ type: 'table', lines: tableLines });
            i = j;
            continue;
        }
        // Заголовок
        if (isHeadingLine(line)) { flushText(); chunks.push({ type: 'heading', line }); i++; continue; }
        // Горизонтальный разделитель
        if (isHrLine(line)) { flushText(); chunks.push({ type: 'hr' }); i++; continue; }
        // Маркированный список
        if (isUlItem(line)) {
            flushText();
            const items = [];
            while (i < lines.length && isUlItem(lines[i])) { items.push(lines[i].match(UL_RE)[2]); i++; }
            chunks.push({ type: 'ul', items });
            continue;
        }
        // Нумерованный список
        if (isOlItem(line)) {
            flushText();
            const items = [];
            let start = parseInt(lines[i].match(OL_RE)[2], 10) || 1;
            while (i < lines.length && isOlItem(lines[i])) { items.push(lines[i].match(OL_RE)[3]); i++; }
            chunks.push({ type: 'ol', items, start });
            continue;
        }
        // Цитата (callout-карточка)
        if (isQuoteLine(line) && line.trim() !== '>') {
            flushText();
            const qLines = [];
            while (i < lines.length && isQuoteLine(lines[i])) { qLines.push(lines[i].match(QUOTE_RE)[1]); i++; }
            chunks.push({ type: 'quote', lines: qLines });
            continue;
        }
        buffer.push(line);
        i++;
    }
    flushText();
    return chunks;
}

function renderTextChunk(text, keyPrefix) {
    const lines = text.split('\n');
    return (
        <p key={keyPrefix} className="my-1.5 first:mt-0 last:mb-0">
            {lines.map((line, i) => (
                <React.Fragment key={i}>
                    {renderInline(line, i)}
                    {i !== lines.length - 1 && <br />}
                </React.Fragment>
            ))}
        </p>
    );
}

function renderChunk(chunk, key) {
    switch (chunk.type) {
        case 'table':
            return <TableBlock key={key} rawLines={chunk.lines} />;
        case 'heading':
            return renderHeadingLine(chunk.line, key);
        case 'hr':
            return <div key={key} className="my-4 h-px bg-gray-200 dark:bg-gray-800" />;
        case 'ul':
            return (
                <ul key={key} className="my-2.5 space-y-1.5">
                    {chunk.items.map((it, i) => (
                        <li key={i} className="flex gap-2.5 items-start">
                            <span className="mt-[0.6em] w-1.5 h-1.5 rounded-full bg-[#5b32d4] dark:bg-purple-400 shrink-0" />
                            <span className="flex-1 min-w-0">{renderInline(it, `${key}-uli-${i}`)}</span>
                        </li>
                    ))}
                </ul>
            );
        case 'ol':
            return (
                <ol key={key} className="my-2.5 space-y-1.5">
                    {chunk.items.map((it, i) => (
                        <li key={i} className="flex gap-2.5 items-start">
                            <span className="mt-0.5 min-w-[1.4em] h-[1.4em] px-1 rounded-md bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 text-[0.72em] font-bold flex items-center justify-center shrink-0">
                                {(chunk.start || 1) + i}
                            </span>
                            <span className="flex-1 min-w-0 pt-px">{renderInline(it, `${key}-oli-${i}`)}</span>
                        </li>
                    ))}
                </ol>
            );
        case 'quote':
            return (
                <div key={key} className="my-3 flex gap-3 pl-3.5 pr-4 py-3 rounded-2xl bg-[#f6f4fd] dark:bg-purple-900/12 border border-[#5b32d4]/15 dark:border-purple-500/20">
                    <div className="w-1 self-stretch rounded-full bg-[#5b32d4]/60 dark:bg-purple-400/60 shrink-0" />
                    <div className="flex-1 min-w-0 text-[0.95em] text-gray-700 dark:text-gray-300">
                        {chunk.lines.map((l, i) => (
                            <React.Fragment key={i}>
                                {renderInline(l, `${key}-q-${i}`)}
                                {i !== chunk.lines.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        default:
            return renderTextChunk(chunk.text, key);
    }
}

export function MessageRenderer({ content }) {
    const blocks = content.split(/(```[\s\S]*?```)/g);
    return (
        <div className="text-[16px] leading-[1.7] break-words min-w-0 max-w-full">
            {blocks.map((block, index) => {
                if (block.startsWith('```') && block.endsWith('```') && block.length >= 6) {
                    const lines = block.slice(3, -3).split('\n');
                    const lang = lines[0].trim().toLowerCase();
                    const code = lines.slice(1).join('\n');
                    if (CHART_LANGS.has(lang)) {
                        return <ChartBlock key={index} code={code} />;
                    }
                    if (CLI_LANGS.has(lang)) {
                        return <CliBlock key={index} code={code} lang={lang} />;
                    }
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
                // в обоих случаях рендерим как безопасный текст. Внутри
                // «обычного текста» разбираем markdown-блоки: таблицы,
                // заголовки, списки, цитаты, разделители.
                const chunks = splitBlocks(block);
                return (
                    <React.Fragment key={index}>
                        {chunks.map((chunk, ci) => renderChunk(chunk, `${index}-c-${ci}`))}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

export { renderInline, renderBoldLine };
