import { useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { copyToCb } from '@/shared/lib/clipboard';

// ==========================================
// useLongPressCopy — long-press на своих сообщениях → копирование
// ==========================================
// Задача:
// - удержание пальца/ЛКМ на своём сообщении (>500мс) запускает
//   GSAP-анимацию (лёгкое сжатие scale: 1 → 0.95 → пульсация → возврат);
// - после анимации содержимое сообщения копируется в буфер;
// - показывается тост «Скопировано».
//
// Реализация:
// - touchstart/mousedown стартуют таймер 500мс;
// - touchend/mouseup/touchmove/mouseleave/pointerleave отменяют таймер
//   (пользователь передумал / скроллит / убрал палец);
// - при срабатывании — GSAP timeline: scale 1 → 0.94 → 1.02 → 1;
// - на 3-м шаге таймлайна вызывается copyToCb + onCopied('Скопировано').
//
// Компоненту нужно повесить возвращаемые обработчики на корневой элемент
// сообщения. onCopied — callback для показа тоста (уже есть в ChatView
// как shareToast).

export function useLongPressCopy(getContent, onCopied, delayMs = 500) {
    const targetRef = useRef(null);
    const timerRef = useRef(null);
    const firedRef = useRef(false);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback((e) => {
        // Не срабатывать на кликах по интерактивным элементам внутри сообщения
        // (кнопки лайка, ссылки и т.п.) — только на самом «пузыре».
        const t = e.target;
        if (t && (t.closest('button') || t.closest('a') || t.closest('input') || t.closest('textarea'))) return;

        firedRef.current = false;
        cancel();
        timerRef.current = setTimeout(() => {
            const el = targetRef.current;
            if (!el) return;
            firedRef.current = true;
            const text = typeof getContent === 'function' ? getContent() : String(getContent || '');
            // GSAP таймлайн: лёгкое сжатие + пульсация + возврат
            const tl = gsap.timeline({
                onComplete: () => {
                    try { copyToCb(text); } catch {}
                    if (onCopied) onCopied('Скопировано');
                },
            });
            tl.to(el, { scale: 0.95, duration: 0.15, ease: 'power2.in' })
              .to(el, { scale: 1.02, duration: 0.15, ease: 'power2.out' })
              .to(el, { scale: 1, duration: 0.2, ease: 'power2.out' });
            // Виброотклик на мобильных (если поддерживается) — короткий импульс
            // как в системном long-press: тактильное подтверждение выделения.
            if (navigator.vibrate) { try { navigator.vibrate(20); } catch {} }
        }, delayMs);
    }, [getContent, onCopied, delayMs, cancel]);

    // Если пользователь дёрнул пальцем/мышью после старта — отменяем.
    const move = useCallback(() => cancel(), [cancel]);
    const end = useCallback(() => cancel(), [cancel]);

    // Спред эти хендлеры на элемент — оба варианта (touch и mouse).
    // React onContextMenu на всякий случай (правая кнопка на десктопе), чтобы
    // не показывалось системное меню поверх нашей анимации.
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
            // Разрешаем правый клик как быструю копию (desktop-эквивалент long-press)
            if (typeof getContent === 'function') {
                const text = getContent();
                if (text && text.trim()) {
                    e.preventDefault();
                    try { copyToCb(text); } catch {}
                    if (onCopied) onCopied('Скопировано');
                }
            }
        },
    };

    return { bind, isFired: () => firedRef.current };
}
