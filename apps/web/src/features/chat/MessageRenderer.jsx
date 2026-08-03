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

// ==========================================
// Определение и извлечение markdown-таблиц из простого текста
// ==========================================
// Модель присылает таблицы в стандартном GFM-формате:
//   | Колонка 1 | Колонка 2 |
//   | --------- | --------- |
//   | значение  | значение  |
// Строка считается «строкой таблицы», если содержит символ | и хотя бы
// один разделитель. Разделитель второй строки — обязательно из тире
// и двоеточий: | --- |, | :--- |, | :---: |, | ---: |.
// Разбиваем блок текста на альтернирующие куски: обычный текст и
// таблицы; таблицы рендерит TableBlock, всё остальное — обычный текст.
function isTableSeparator(line) {
    // допускаем ровно один : с любой стороны каждого сегмента,
    // остальные символы — тире и пробелы, обязательно есть хотя бы один |
    if (!line.includes('|')) return false;
    const cells = line.split('|').map(s => s.trim()).filter(s => s !== '');
    if (cells.length === 0) return false;
    return cells.every(c => /^:?-{3,}:?$/.test(c));
}

function isPipeRow(line) {
    // "Похоже на строку таблицы": есть хотя бы два | и это не разделитель.
    // Проверяем по количеству разделителей — таблица имеет >=2 колонок.
    const pipes = (line.match(/\|/g) || []).length;
    return pipes >= 2;
}

// Разбирает произвольный текст на массив кусков: { type: 'text', text }
// или { type: 'table', lines: [...] }. Таблица = строка-заголовок +
// строка-разделитель + одна или более строк с данными.
function splitTextAndTables(text) {
    const lines = text.split('\n');
    const chunks = [];
    let buffer = [];
    let i = 0;
    const flushText = () => {
        if (buffer.length) {
            chunks.push({ type: 'text', text: buffer.join('\n') });
            buffer = [];
        }
    };
    while (i < lines.length) {
        const line = lines[i];
        const next = lines[i + 1];
        // Возможное начало таблицы: строка-заголовок с | и следующая — разделитель
        if (isPipeRow(line) && next !== undefined && isTableSeparator(next)) {
            flushText();
            const tableLines = [line, next];
            let j = i + 2;
            while (j < lines.length && isPipeRow(lines[j])) {
                tableLines.push(lines[j]);
                j++;
            }
            chunks.push({ type: 'table', lines: tableLines });
            i = j;
            continue;
        }
        buffer.push(line);
        i++;
    }
    flushText();
    return chunks;
}

// Рендер куска обычного текста (между таблицами) — переиспользуем
// прежнюю логику с bold и <br>.
function renderTextChunk(text, keyPrefix) {
    const lines = text.split('\n');
    return (
        <span key={keyPrefix}>
            {lines.map((line, i) => (
                <React.Fragment key={i}>
                    {renderBoldLine(line, i)}
                    {i !== lines.length - 1 && <br />}
                </React.Fragment>
            ))}
        </span>
    );
}

export function MessageRenderer({ content }) {
    const blocks = content.split(/(```[\s\S]*?```)/g);
    return (
        <div className="text-[17px] sm:text-[18px] leading-relaxed break-words min-w-0 max-w-full">
            {blocks.map((block, index) => {
                if (block.startsWith('```') && block.endsWith('```') && block.length >= 6) {
                    const lines = block.slice(3, -3).split('\n');
                    const lang = lines[0].trim().toLowerCase();
                    const code = lines.slice(1).join('\n');
                    // CHART-виджет для графиков (line/bar).
                    if (CHART_LANGS.has(lang)) {
                        return <ChartBlock key={index} code={code} />;
                    }
                    // CLI-виджет для консольных команд.
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
                // в обоих случаях рендерим как безопасный текст, без HTML-инъекции.
                // Внутри «обычного текста» ищем markdown-таблицы и вырезаем
                // их в TableBlock, а остальное оставляем как есть.
                const chunks = splitTextAndTables(block);
                return (
                    <React.Fragment key={index}>
                        {chunks.map((chunk, ci) => {
                            if (chunk.type === 'table') {
                                return <TableBlock key={`${index}-t-${ci}`} rawLines={chunk.lines} />;
                            }
                            return renderTextChunk(chunk.text, `${index}-t-${ci}`);
                        })}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
