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
// Позиция — position: fixed, посчитанная от anchorRef при открытии,
// ресайзе И скролле (кнопка может уехать при прокрутке страницы, и меню
// должно уехать вместе с ней, а не зависнуть на месте).
//
// Задача 2 (баг «меню видео/голоса упирается в верхнюю грань»): раньше
// меню ВСЕГДА раскрывалось вверх (bottom считался от верха кнопки). Если
// кнопка стоит близко к верху экрана (а панель настроек видео — прямо под
// заголовком), места сверху нет, и высокий список (7 пропорций, длинный
// список голосов) упирался в верхнюю грань и обрезался. Теперь направление
// выбирается по фактически доступному месту: если снизу от кнопки места
// не меньше, чем сверху — открываем ВНИЗ, иначе ВВЕРХ. В любом случае
// max-height жёстко ограничен доступной высотой в выбранную сторону (минус
// отступы), поэтому меню НИКОГДА не вылезает ни за верхний, ни за нижний
// край — при нехватке места внутри появляется собственный скролл.
export function AnchoredMenu({ open, onClose, anchorRef, width = 200, className = '', children }) {
    const [style, setStyle] = useState(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) { setStyle(null); return undefined; }
        const margin = 12; // отступ от краёв экрана
        const gap = 8;     // зазор между кнопкой и меню

        const compute = () => {
            if (!anchorRef.current) return;
            const rect = anchorRef.current.getBoundingClientRect();
            const w = Math.min(width, window.innerWidth - margin * 2);

            // Горизонталь: выравниваем правый край меню с правым краем
            // кнопки, затем клэмпим в [margin, viewport - w - margin], чтобы
            // не вылезти ни за левый, ни за правый край.
            let left = rect.right - w;
            left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));

            // Доступное место под кнопкой и над ней (минус зазор и отступ).
            const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
            const spaceAbove = rect.top - gap - margin;

            // Открываем вниз, если снизу места не меньше, чем сверху (для
            // дропдаунов это привычнее); иначе вверх. В обе стороны высота
            // ограничена доступным местом — меню всегда внутри экрана.
            if (spaceBelow >= spaceAbove) {
                setStyle({
                    left,
                    top: rect.bottom + gap,
                    width: w,
                    maxH: Math.max(0, spaceBelow),
                });
            } else {
                setStyle({
                    left,
                    bottom: window.innerHeight - rect.top + gap,
                    width: w,
                    maxH: Math.max(0, spaceAbove),
                });
            }
        };

        compute();
        window.addEventListener('resize', compute);
        // capture=true — ловим скролл любого прокручиваемого предка, а не
        // только окна (панель настроек видео живёт внутри своего скролл-контейнера).
        window.addEventListener('scroll', compute, true);
        return () => {
            window.removeEventListener('resize', compute);
            window.removeEventListener('scroll', compute, true);
        };
    }, [open, anchorRef, width]);

    if (!open || !style) return null;

    const posStyle = style.top != null
        ? { left: style.left, top: style.top, width: style.width, maxHeight: style.maxH }
        : { left: style.left, bottom: style.bottom, width: style.width, maxHeight: style.maxH };

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className={`fixed overflow-y-auto bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl shadow-2xl z-50 p-1 ${className}`}
                style={posStyle}
            >
                {children}
            </div>
        </>
    );
}
