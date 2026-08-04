import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// MessageActionMenu — мини-меню «Скопировать / Редактировать»
// ==========================================
// Показывается поверх своего (user) сообщения после long-press. Раньше
// long-press сразу копировал текст без выбора действия — теперь
// зажатие открывает компактное плавающее меню из двух круглых кнопок,
// а копирование/редактирование происходит по явному тапу на одну из них.
//
// Позиционирование: меню всплывает НАД сообщением (по центру, чуть выше
// верхнего края пузыря), т.к. это самый предсказуемый паттерн (как в
// Telegram/WhatsApp context-меню).
//
// GSAP-анимация появления: scale 0.5→1 + opacity 0→1 с лёгким overshoot
// (back.out), сама точка старта — от места, где был палец (заданной
// пропорционально центру сообщения). Исчезновение — быстрый обратный твин.
export function MessageActionMenu({ open, onCopy, onEdit, onClose }) {
    const menuRef = useRef(null);
    const tweenRef = useRef(null);

    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        tweenRef.current?.kill();
        if (open) {
            gsap.set(el, { autoAlpha: 0, scale: 0.5, y: 8 });
            el.style.pointerEvents = 'auto';
            tweenRef.current = gsap.to(el, {
                autoAlpha: 1,
                scale: 1,
                y: 0,
                duration: 0.28,
                ease: 'back.out(2.2)',
            });
        } else {
            tweenRef.current = gsap.to(el, {
                autoAlpha: 0,
                scale: 0.5,
                y: 8,
                duration: 0.16,
                ease: 'power2.in',
                onComplete: () => { if (el) el.style.pointerEvents = 'none'; },
            });
        }
        return () => tweenRef.current?.kill();
    }, [open]);

    // Клик вне меню — закрыть. Слушаем только когда меню открыто.
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
        };
        // Небольшая задержка — иначе тот же самый touchend/mouseup, что
        // открыл меню, тут же его и закроет.
        const t = setTimeout(() => {
            document.addEventListener('mousedown', handler);
            document.addEventListener('touchstart', handler);
        }, 50);
        return () => {
            clearTimeout(t);
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, [open, onClose]);

    return (
        <div
            ref={menuRef}
            // Меню теперь ПОД сообщением, а не над: пользователь просил
            // перенести. transformOrigin из bottom-right в top-right —
            // GSAP scale-анимация «раскрывается вниз» из верхнего края.
            className="absolute top-full mt-2 right-0 z-40 flex items-center gap-1.5 bg-white dark:bg-darkCard rounded-2xl shadow-xl border border-gray-100 dark:border-darkBorder px-1.5 py-1.5"
            style={{ transformOrigin: 'top right' }}
            onClick={(e) => e.stopPropagation()}
        >
            <button
                onClick={onCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
                <Icons.Copy className="w-3.5 h-3.5" />
                Скопировать
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
                <Icons.Pencil className="w-3.5 h-3.5" />
                Редактировать
            </button>
        </div>
    );
}
