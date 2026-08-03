import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// TableBlock — рендер markdown-таблиц в чате
// ==========================================
// Модель присылает таблицы в стандартном формате GFM:
//   | Колонка | Колонка |
//   | ------- | ------- |
//   |  ...    |  ...    |
// MessageRenderer определяет такие блоки и передаёт сюда строки, а
// компонент разбирает их в структуру { headers, rows } и рисует
// в едином стиле проекта.
//
// Тема:
// - светлая: белый фон, фиолетовый заголовок, тёплый серый в полосах;
// - тёмная: фирменный darkCard (#1a1a24) фон, фиолетовый заголовок,
//   более тёмная полоса. Оба варианта через Tailwind `dark:` (класс на
//   <html>), никакого CSS в JS не нужно.
//
// Горизонтальный скролл на узких экранах — чтобы длинные таблицы
// не ломали вёрстку чата.
//
// Форматирование ячеек: поддерживаем **жирный** (одно применение bold из
// MessageRenderer), остальное — как обычный текст. HTML не рендерим —
// безопаснее и достаточно для случая "числа + короткие заголовки".

function renderCell(text, keyPrefix) {
    if (!text) return null;
    const parts = String(text).split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
        }
        return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    });
}

// Разбирает строку "| a | b | c |" в массив ["a", "b", "c"]. Крайние
// пустые ячейки (от начальной/конечной вертикальной черты) отбрасываем.
function parseRow(line) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    return cells;
}

export function TableBlock({ rawLines }) {
    const rootRef = useRef(null);

    // rawLines — массив уже отфильтрованных строк markdown-таблицы:
    // [0] header, [1] разделитель |---|---|, [2..] data
    const headers = parseRow(rawLines[0] || '');
    const bodyRows = rawLines.slice(2).map(parseRow).filter(r => r.length > 0);
    const columnCount = Math.max(headers.length, ...bodyRows.map(r => r.length));

    // Определение выравнивания по разделителю: | :--- | :---: | ---: |
    const align = (rawLines[1] || '').split('|').map(s => s.trim()).filter(s => s).map(sep => {
        const l = sep.startsWith(':');
        const r = sep.endsWith(':');
        if (l && r) return 'center';
        if (r) return 'right';
        return 'left';
    });

    // Появление — плавно снизу вверх, чтобы соответствовало стилю остальных виджетов
    useGSAP(() => {
        if (!rootRef.current) return;
        gsap.from(rootRef.current, { y: 10, opacity: 0, duration: 0.4, ease: 'power2.out' });
    }, { scope: rootRef });

    return (
        <div
            ref={rootRef}
            className="my-3 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-darkCard shadow-sm"
        >
            <div className="overflow-x-auto void-cli-scroll">
                <table className="w-full text-[13px] text-gray-800 dark:text-gray-200 border-collapse">
                    <thead>
                        <tr className="bg-[#efecf9] dark:bg-[#181828] border-b border-gray-200 dark:border-gray-800">
                            {Array.from({ length: columnCount }).map((_, i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2.5 font-semibold text-[#5b32d4] dark:text-purple-300 whitespace-nowrap"
                                    style={{ textAlign: align[i] || 'left' }}
                                >
                                    {renderCell(headers[i] || '', `h-${i}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {bodyRows.map((row, ri) => (
                            <tr
                                key={ri}
                                className={
                                    `border-b border-gray-100 dark:border-gray-800/40 transition-colors ` +
                                    `${ri % 2 === 1
                                        ? 'bg-gray-50 dark:bg-[#131322]'
                                        : 'bg-white dark:bg-darkCard'} ` +
                                    `hover:bg-[#efecf9]/50 dark:hover:bg-[#1a1a2e]`
                                }
                            >
                                {Array.from({ length: columnCount }).map((_, ci) => (
                                    <td
                                        key={ci}
                                        className="px-3 py-2 align-top"
                                        style={{ textAlign: align[ci] || 'left' }}
                                    >
                                        {renderCell(row[ci] || '', `c-${ri}-${ci}`)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
