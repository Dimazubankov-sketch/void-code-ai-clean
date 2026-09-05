import { useCallback, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { EASE, DUR, prefersReducedMotion } from '@/shared/lib/motion';

// ==========================================
// SegmentedSlider — сегментированный переключатель-«ползунок»
// ==========================================
// Обычный набор кнопок только реагирует на тап по конкретному варианту.
// Здесь же «таблетка»-индикатор можно ПЕРЕТАЩИТЬ пальцем/мышью через
// весь ряд — как значение прыгает при пересечении границы соседнего
// варианта, так и обновляется выбор (в реальном времени, не только по
// отпусканию). Плюс — тактильный отклик на нажатие индикатора.
//
// Позиция и ширина индикатора меряются по реальным DOM-узлам кнопок
// (getBoundingClientRect), а не по проценту от количества вариантов —
// подписи могут быть разной длины (иконка + текст, "480p" и "720p" и т.д.).
export function SegmentedSlider({ options, value, onChange, className = '' }) {
    const containerRef = useRef(null);
    const thumbRef = useRef(null);
    const btnRefs = useRef([]);
    const draggingRef = useRef(false);
    const lastIndexRef = useRef(0);

    const indexOf = useCallback((v) => {
        const i = options.findIndex((o) => o.value === v);
        return i === -1 ? 0 : i;
    }, [options]);

    const moveThumbTo = useCallback((index, animate) => {
        const btn = btnRefs.current[index];
        const container = containerRef.current;
        const thumb = thumbRef.current;
        if (!btn || !container || !thumb) return;
        const cRect = container.getBoundingClientRect();
        const bRect = btn.getBoundingClientRect();
        const x = bRect.left - cRect.left;
        const w = bRect.width;
        if (animate && !prefersReducedMotion()) {
            gsap.to(thumb, { x, width: w, duration: DUR.dropdown, ease: EASE.out, overwrite: 'auto' });
        } else {
            gsap.set(thumb, { x, width: w });
        }
        lastIndexRef.current = index;
    }, []);

    // Первичная расстановка без анимации (иначе таблетка «прилетала» бы
    // при первом рендере) + пересчёт при ресайзе контейнера (например,
    // при повороте экрана или смене раскладки в flex-wrap).
    useGSAP(() => {
        moveThumbTo(indexOf(value), false);
        if (typeof ResizeObserver === 'undefined' || !containerRef.current) return undefined;
        const ro = new ResizeObserver(() => moveThumbTo(lastIndexRef.current, false));
        ro.observe(containerRef.current);
        return () => ro.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, { scope: containerRef });

    useLayoutEffect(() => {
        moveThumbTo(indexOf(value), true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, options.length]);

    const nearestIndexAt = (clientX) => {
        let nearestIndex = 0;
        let nearestDist = Infinity;
        btnRefs.current.forEach((btn, i) => {
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const center = r.left + r.width / 2;
            const dist = Math.abs(center - clientX);
            if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
        });
        return nearestIndex;
    };

    const applyDrag = (clientX) => {
        const i = nearestIndexAt(clientX);
        moveThumbTo(i, false);
        const opt = options[i];
        if (opt && opt.value !== value) onChange(opt.value);
    };

    const handlePointerDown = (e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (!prefersReducedMotion()) {
            gsap.to(thumbRef.current, { scale: 0.96, duration: DUR.press, ease: EASE.out, overwrite: 'auto' });
        }
        applyDrag(e.clientX);
    };
    const handlePointerMove = (e) => {
        if (!draggingRef.current) return;
        applyDrag(e.clientX);
    };
    const endDrag = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        if (!prefersReducedMotion()) {
            gsap.to(thumbRef.current, { scale: 1, duration: DUR.release, ease: EASE.press, overwrite: 'auto' });
        }
        moveThumbTo(indexOf(value), true);
    };

    return (
        <div
            ref={containerRef}
            className={`relative flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1 select-none touch-none ${className}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerCancel={endDrag}
            style={{ willChange: 'transform' }}
        >
            <div
                ref={thumbRef}
                className="absolute top-1 bottom-1 left-0 rounded-full bg-white dark:bg-darkCard shadow-sm pointer-events-none"
                style={{ willChange: 'transform, width' }}
            />
            {options.map((opt, i) => (
                <button
                    key={opt.value}
                    type="button"
                    ref={(el) => { btnRefs.current[i] = el; }}
                    onClick={() => { onChange(opt.value); moveThumbTo(i, true); }}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${opt.value === value ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
