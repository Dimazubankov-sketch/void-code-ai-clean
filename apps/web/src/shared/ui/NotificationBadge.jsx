import { useEffect, useState } from 'react';

// ==========================================
// NotificationBadge — бейдж непрочитанного (задача 7)
// ==========================================
// Строго по присланной спеке transitions.dev «Notification badge»:
// сам якорь (кнопка почты) должен быть position:relative, .t-badge —
// абсолютно спозиционированная обёртка, которая слайдится при появлении
// (data-open="true"), а число внутри (.t-badge-dot) выскакивает пружиной
// (pop) и тает при исчезновении. Слайдится и выскакивает только бейдж —
// сама кнопка-триггер (иконка конверта) не шевелится.
//
// displayCount хранит ПОСЛЕДНЕЕ ненулевое значение: когда все письма
// прочитаны и count падает до 0, бейдж не должен мигнуть цифрой «0» перед
// тем как растаять — он тает с тем числом, что было видно секунду назад.
export function NotificationBadge({ count }) {
    const [displayCount, setDisplayCount] = useState(count);
    useEffect(() => { if (count > 0) setDisplayCount(count); }, [count]);

    const open = count > 0;
    return (
        <span className="t-badge" data-open={open ? 'true' : 'false'}>
            <span className="t-badge-dot">{displayCount > 99 ? '99+' : displayCount}</span>
        </span>
    );
}

// Вариант для строчного контекста (пункт списка меню — «Почта» в
// развороте «Больше»), а не значка в углу иконки. Важно: компонент
// ВСЕГДА монтирован (родитель никогда не должен рендерить его условно по
// count > 0) — иначе React будет добавлять/убирать DOM-узел напрямую, и
// CSS-transition при появлении/исчезновении просто не успеет сыграть.
// Показ/скрытие делает CSS через data-open, а не React через мёртвый/
// живой рендер.
export function InlineNotificationBadge({ count }) {
    const [displayCount, setDisplayCount] = useState(count);
    useEffect(() => { if (count > 0) setDisplayCount(count); }, [count]);

    const open = count > 0;
    return (
        <span className="t-badge-static" data-open={open ? 'true' : 'false'}>
            <span className="t-badge-dot">{displayCount > 99 ? '99+' : displayCount}</span>
        </span>
    );
}
