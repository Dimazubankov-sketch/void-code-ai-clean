import { useLayoutEffect, useState } from 'react';

// ==========================================
// AnchoredMenu — поповер, который ВСЕГДА помещается на экране
// ==========================================
// Раньше позиция дропдауна задавалась чистым CSS (absolute + left-0/
// right-0 от кнопки-триггера). Это ломалось на мобильном: якорь left-0
// уводил меню за правый край экрана, если кнопка была ближе к правому
// краю ряда, а right-0 — наоборот, за левый край, если кнопка ближе к
// левому краю (см. баг: дропдаун выбора модели видео вылезал за экран
// слева). Чистый CSS не может «знать», сколько места есть с каждой
// стороны от конкретной кнопки в конкретный момент — это можно только
// посчитать в JS по реальным координатам (getBoundingClientRect).
//
// Здесь позиция — position: fixed, посчитанная от anchorRef при каждом
// открытии и при ресайзе (например, при повороте экрана или появлении
// клавиатуры), с отступом margin от каждого края экрана. Меню всегда
// раскрывается НАД кнопкой (bottom: computed from anchor top).
export function AnchoredMenu({ open, onClose, anchorRef, width = 200, className = '', children }) {
    const [style, setStyle] = useState(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) { setStyle(null); return undefined; }
        const margin = 12;
        const compute = () => {
            const rect = anchorRef.current.getBoundingClientRect();
            const w = Math.min(width, window.innerWidth - margin * 2);
            // По умолчанию выравниваем правый край меню с правым краем
            // кнопки (как обычно открываются меню слева-направо-читаемых
            // интерфейсов), но клэмпим итоговый left в [margin, viewport - w - margin],
            // чтобы независимо от исходного якоря меню не могло вылезти
            // ни за левый, ни за правый край экрана.
            let left = rect.right - w;
            left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
            const bottom = Math.max(margin, window.innerHeight - rect.top + 8);
            setStyle({ left, bottom, width: w });
        };
        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [open, anchorRef, width]);

    if (!open || !style) return null;

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className={`fixed max-h-[60vh] overflow-y-auto bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl shadow-2xl z-50 p-1 ${className}`}
                style={{ left: style.left, bottom: style.bottom, width: style.width }}
            >
                {children}
            </div>
        </>
    );
}
