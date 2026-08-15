// ==========================================
// PersonaStickers — векторные стикеры для «личностей» голосового режима
// ==========================================
// Раньше здесь были эмодзи. Проблема эмодзи: их рисует шрифт ОС, поэтому
// на iOS, Android и Windows они выглядят по-разному (цветные, разного
// веса и стиля), из-за чего ряд личностей смотрелся разнородно и не
// вписывался в остальной интерфейс. SVG рисуем сами: одинаковая
// линейная графика везде, наследует currentColor и одинаково читается
// в светлой и тёмной теме.
//
// Все иконки нарисованы в одной сетке 24×24 с одинаковой толщиной линии,
// чтобы в ряду они выглядели как один набор, а не как случайная сборка.

const base = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    viewBox: '0 0 24 24',
};

const S = (paths) => ({ className = 'w-7 h-7' }) => (
    <svg className={className} {...base}>{paths}</svg>
);

// Порядок важен: он же используется как порядок в пикере.
export const PERSONA_STICKERS = [
    { id: 'smile',    Icon: S(<><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.5 14a4.5 4.5 0 007 0" /></>) },
    { id: 'robot',    Icon: S(<><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 16h5" /><circle cx="12" cy="3.5" r="1.2" /></>) },
    { id: 'brain',    Icon: S(<><path d="M12 5.5a3 3 0 00-5.7 1.3A3 3 0 004 9.6a3 3 0 001.4 2.5A3 3 0 007 17a3 3 0 005 1.6z" /><path d="M12 5.5a3 3 0 015.7 1.3A3 3 0 0120 9.6a3 3 0 01-1.4 2.5A3 3 0 0117 17a3 3 0 01-5 1.6z" /><path d="M12 5.5v13" /></>) },
    { id: 'book',     Icon: S(<><path d="M4 5.5A1.5 1.5 0 015.5 4H10a2.5 2.5 0 012.5 2.5V20a2 2 0 00-2-2H5.5A1.5 1.5 0 014 16.5z" /><path d="M20 5.5A1.5 1.5 0 0018.5 4H14a2.5 2.5 0 00-2.5 2.5V20a2 2 0 012-2h5A1.5 1.5 0 0020 16.5z" /></>) },
    { id: 'bear',     Icon: S(<><circle cx="12" cy="13.5" r="6" /><circle cx="6.5" cy="6.5" r="2.6" /><circle cx="17.5" cy="6.5" r="2.6" /><path d="M10 12.5h.01M14 12.5h.01M10.5 16a2.5 2.5 0 003 0" /></>) },
    { id: 'graduate', Icon: S(<><path d="M2.5 9L12 5l9.5 4L12 13z" /><path d="M6.5 11v4.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V11" /><path d="M21.5 9v5" /></>) },
    { id: 'detective',Icon: S(<><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.6 14.6L20 20" /></>) },
    { id: 'chef',     Icon: S(<><path d="M7 12.5a3.5 3.5 0 111.4-6.7 3.5 3.5 0 017.2 0A3.5 3.5 0 1117 12.5z" /><path d="M7 12.5V18a2 2 0 002 2h6a2 2 0 002-2v-5.5" /><path d="M7 16h10" /></>) },
    { id: 'medic',    Icon: S(<><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="9" /></>) },
    { id: 'teacher',  Icon: S(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 16v4M8 20h8M7 8h6M7 11h4" /></>) },
    { id: 'palette',  Icon: S(<><path d="M12 3.5a8.5 8.5 0 000 17c1.4 0 2-1 2-1.8 0-1.7-1.6-1.6-1.6-3 0-.9.8-1.7 1.8-1.7h1.9A4.4 4.4 0 0020.5 10c0-3.6-3.8-6.5-8.5-6.5z" /><circle cx="8" cy="9" r="1" /><circle cx="12" cy="7" r="1" /><circle cx="16" cy="9.5" r="1" /></>) },
    { id: 'headset',  Icon: S(<><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="2.5" y="13" width="4" height="7" rx="1.5" /><rect x="17.5" y="13" width="4" height="7" rx="1.5" /><path d="M20 19v1a3 3 0 01-3 3h-3" /></>) },
    { id: 'muscle',   Icon: S(<><path d="M4 10h4M20 10h-4M6 10v4M18 10v4M4 12h16" /><rect x="8" y="7.5" width="8" height="9" rx="2" /></>) },
    { id: 'leaf',     Icon: S(<><path d="M20 4c0 9-5.5 13-11 13a5 5 0 01-5-5C4 6.5 11 4 20 4z" /><path d="M4 20c2-6 6-9 12-11" /></>) },
    { id: 'crystal',  Icon: S(<><path d="M12 3l7 6-7 12L5 9z" /><path d="M5 9h14M12 3v18" /></>) },
    { id: 'bolt',     Icon: S(<><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z" /></>) },
    { id: 'moon',     Icon: S(<><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" /></>) },
    { id: 'coffee',   Icon: S(<><path d="M3.5 8h13v6a5 5 0 01-5 5h-3a5 5 0 01-5-5z" /><path d="M16.5 9.5H19a2.5 2.5 0 010 5h-2.5" /><path d="M6 3.5v2M10 3v2.5M14 3.5v2" /></>) },
    { id: 'rocket',   Icon: S(<><path d="M12 2.5c3.5 2.5 5 6 5 9.5l-2.5 3h-5L7 12c0-3.5 1.5-7 5-9.5z" /><circle cx="12" cy="9.5" r="1.8" /><path d="M9.5 15l-2 4 3-1.5M14.5 15l2 4-3-1.5" /></>) },
    { id: 'owl',      Icon: S(<><circle cx="12" cy="12.5" r="8" /><circle cx="9" cy="11" r="2.2" /><circle cx="15" cy="11" r="2.2" /><path d="M12 14v1.5M6.5 6l2 2M17.5 6l-2 2" /></>) },
    { id: 'compass',  Icon: S(<><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>) },
    { id: 'anchor',   Icon: S(<><circle cx="12" cy="5" r="2.2" /><path d="M12 7.2V21" /><path d="M6 11H4a8 8 0 0016 0h-2" /><path d="M8.5 11h7" /></>) },
    { id: 'flame',    Icon: S(<><path d="M12 3s5 4.2 5 8.6a5 5 0 01-10 0C7 9.4 9 7.6 9 7.6s.4 2 1.6 2.6C11 8.4 12 5.8 12 3z" /><path d="M12 21a4 4 0 01-4-4" /></>) },
    { id: 'chart',    Icon: S(<><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>) },
    { id: 'shield',   Icon: S(<><path d="M12 3l7 3v6c0 4-3 7.3-7 9-4-1.7-7-5-7-9V6z" /><path d="M9.5 12l1.8 1.8L15 10" /></>) },
    { id: 'puzzle',   Icon: S(<><path d="M10 4.5a1.8 1.8 0 013.6 0V6H17a1 1 0 011 1v3.4h1.5a1.8 1.8 0 010 3.6H18V18a1 1 0 01-1 1h-3.4v-1.5a1.8 1.8 0 00-3.6 0V19H7a1 1 0 01-1-1v-3.4H4.5a1.8 1.8 0 010-3.6H6V7a1 1 0 011-1h3z" /></>) },
    { id: 'globe',    Icon: S(<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.4 2.6 3.6 5.5 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.5-3.6-8.5s1.2-5.9 3.6-8.5z" /></>) },
    { id: 'mask',     Icon: S(<><path d="M4 7c3-1 5.5-1 8-1s5 0 8 1c0 6-3 11-8 11S4 13 4 7z" /><path d="M9 11h.01M15 11h.01M10 14.5a3 3 0 004 0" /></>) },
    { id: 'star',     Icon: S(<><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8z" /></>) },
    { id: 'wrench',   Icon: S(<><path d="M15.5 3.5a5.5 5.5 0 00-6.9 6.9L3.5 15.5a2 2 0 002.8 2.8l5.1-5.1a5.5 5.5 0 006.9-6.9l-3 3-2.8-2.8z" /></>) },
];

export const STICKER_MAP = Object.fromEntries(PERSONA_STICKERS.map((s) => [s.id, s.Icon]));

// Отрисовать стикер по id; неизвестный/старый (эмодзи из прошлой версии)
// молча падает на первый — так сохранённые ранее личности не ломаются.
export function StickerIcon({ id, className = 'w-7 h-7' }) {
    const Icon = STICKER_MAP[id] || PERSONA_STICKERS[0].Icon;
    return <Icon className={className} />;
}
