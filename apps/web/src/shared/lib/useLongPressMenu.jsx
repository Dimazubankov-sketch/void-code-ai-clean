import { useRef, useCallback, useState } from 'react';
import { gsap } from 'gsap';

// ==========================================
// useLongPressMenu — long-press на своих сообщениях → мини-меню действий
// ==========================================
// Раньше long-press сразу копировал текст. Теперь зажатие (>450мс)
// проигрывает лёгкую GSAP-«обратную связь» (сжатие пузыря) и открывает
// плавающее меню с двумя действиями — «Скопировать» и «Редактировать»
// (см. MessageActionMenu.jsx). Выбор конкретного действия происходит
// уже explicit-тапом по одной из кнопок меню.
//
// Реализация зажатия — как раньше: touchstart/mousedown стартуют таймер,
// touchmove/touchend/mouseleave отменяют его (пользователь передумал/
// скроллит). При срабатывании таймера — короткая GSAP-анимация «pulse»
// на самом пузыре сообщения (даёт тактильный фидбек, что зажатие
// распознано) и сразу следом открытие меню через setMenuOpen(true).

export function useLongPressMenu(delayMs = 450) {
    const targetRef = useRef(null);
    const timerRef = useRef(null);
    const startPosRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startPosRef.current = null;
    }, []);

    const start = useCallback((e) => {
        const t = e.target;
        // Не перехватывать зажатие на интерактивных элементах внутри сообщения
        if (t && (t.closest('button') || t.closest('a') || t.closest('input') || t.closest('textarea'))) return;

        // Запоминаем стартовую точку касания — нужна для порога сдвига
        // ниже (см. move). Для мыши не критично (там нет дрожания), но
        // не мешает — тот же код работает единообразно для обоих.
        const point = e.touches && e.touches[0] ? e.touches[0] : e;
        startPosRef.current = { x: point.clientX, y: point.clientY };

        cancel();
        timerRef.current = setTimeout(() => {
            const el = targetRef.current;
            if (el) {
                // Короткий «pulse» — тактильная обратная связь, что зажатие
                // сработало, ДО того как меню появится.
                gsap.timeline()
                    .to(el, { scale: 0.96, duration: 0.12, ease: 'power2.in' })
                    .to(el, { scale: 1, duration: 0.18, ease: 'power2.out' });
            }
            if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* noop */ } }
            setMenuOpen(true);
        }, delayMs);
    }, [delayMs, cancel]);

    // ПОРОГ СДВИГА (баг-фикс): раньше ЛЮБОЕ touchmove-событие (даже на
    // долю пикселя — обычное дрожание пальца при удержании на месте, а
    // не жест скролла) мгновенно отменяло таймер зажатия через cancel().
    // На реальных телефонах палец физически никогда не стоит абсолютно
    // неподвижно, поэтому таймер обрывался практически сразу после
    // touchstart и long-press НИКОГДА не успевал сработать — по факту
    // функциональность была недостижима на touch-устройствах. Теперь
    // отменяем зажатие только при заметном сдвиге (>10px) — это уже
    // явно жест скролла/свайпа, а не дрожание руки в покое.
    const MOVE_CANCEL_THRESHOLD = 10;
    const move = useCallback((e) => {
        const start = startPosRef.current;
        if (!start) return;
        const point = e.touches && e.touches[0] ? e.touches[0] : e;
        const dx = point.clientX - start.x;
        const dy = point.clientY - start.y;
        if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_THRESHOLD) cancel();
    }, [cancel]);
    const end = useCallback(() => cancel(), [cancel]);

    const bind = {
        ref: (node) => { targetRef.current = node; },
        onTouchStart: start,
        onTouchEnd: end,
        onTouchMove: move,
        onTouchCancel: end,
        onMouseDown: start,
        onMouseUp: end,
        onMouseLeave: end,
        onContextMenu: (e) => {
            // Правый клик на десктопе — тот же мини-меню вместо системного
            e.preventDefault();
            setMenuOpen(true);
        },
    };

    return { bind, menuOpen, setMenuOpen };
}
