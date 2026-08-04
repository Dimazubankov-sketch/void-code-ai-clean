import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ChatActionsMenu — контекстное меню чата
// ==========================================
// Единый компонент для двух мест:
//   - шапка чата (иконка троеточия сверху) — задача №11;
//   - список истории чатов (long-press по строке чата) — задача №12.
//
// Действия:
//   share      — Поделиться чатом
//   pin        — Закрепить в истории (или Открепить, если уже закреплён)
//   rename     — Переименовать
//   moveToProj — Добавить в проект
//   delete     — Удалить
//
// GSAP-анимация: раскрытие (opacity 0→1, scale 0.8→1, y 6→0) с
// back.out overshoot; свёртка (opacity 1→0, scale 0.9, y -4).
// Позиционирование — через className родителя (absolute + top/right).

export function ChatActionsMenu({ open, onClose, onAction, alreadyPinned = false, position = 'top-right' }) {
    const ref = useRef(null);
    const tweenRef = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        tweenRef.current?.kill();
        if (open) {
            gsap.set(el, { autoAlpha: 0, scale: 0.8, y: 6 });
            el.style.pointerEvents = 'auto';
            tweenRef.current = gsap.to(el, {
                autoAlpha: 1,
                scale: 1,
                y: 0,
                duration: 0.28,
                ease: 'back.out(1.8)',
            });
        } else {
            tweenRef.current = gsap.to(el, {
                autoAlpha: 0,
                scale: 0.9,
                y: -4,
                duration: 0.18,
                ease: 'power2.in',
                onComplete: () => { if (el) el.style.pointerEvents = 'none'; },
            });
        }
        return () => tweenRef.current?.kill();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        };
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

    // Позиционные варианты. Для шапки чата — top-full right-0 (открывается
    // ВНИЗ из троеточия). Для списка истории — right-2 top-1/2 (открывается
    // рядом со строкой чата).
    const positionClass = position === 'inline' ? 'absolute right-2 top-8' : 'absolute top-full right-0 mt-2';

    const items = [
        { id: 'share', label: 'Поделиться', icon: Icons.Share },
        { id: 'pin', label: alreadyPinned ? 'Открепить' : 'Закрепить', icon: Icons.Pin || Icons.Star },
        { id: 'rename', label: 'Переименовать', icon: Icons.Pencil },
        { id: 'moveToProj', label: 'Добавить в проект', icon: Icons.Folder },
        { id: 'delete', label: 'Удалить', icon: Icons.Trash, danger: true },
    ];

    return (
        <div
            ref={ref}
            className={`${positionClass} z-50 w-56 bg-white dark:bg-darkCard rounded-2xl shadow-2xl border border-gray-100 dark:border-darkBorder overflow-hidden`}
            style={{ transformOrigin: 'top right' }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-1">
                {items.map((it) => {
                    const Icon = it.icon;
                    return (
                        <button
                            key={it.id}
                            onClick={() => onAction(it.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                it.danger
                                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                            <span>{it.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
