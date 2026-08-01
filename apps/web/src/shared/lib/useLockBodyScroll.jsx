import { useEffect } from 'react';

// ==========================================
// useLockBodyScroll — заморозить прокрутку фона под модалкой
// ==========================================
// Пока открыта модалка (Голос, Личные данные, Лимиты, Языки), фон за ней
// не должен прокручиваться — иначе, листнув, пользователь видит нижнюю
// часть настроек (например, кнопку «Выйти из аккаунта»), а модалка
// «уезжает».
//
// В приложении прокручивается НЕ body, а внутренний контейнер вида
// (div с overflow-y-auto). Поэтому блокируем оба уровня:
//  1) body/html — на случай, если прокрутка всё же на нём;
//  2) все реально прокручиваемые контейнеры внутри #root — им временно
//     ставим overflow:hidden, а на выходе возвращаем прежнее значение.

export function useLockBodyScroll(active = true) {
    useEffect(() => {
        if (!active) return;

        const prevBodyOverflow = document.body.style.overflow;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        // Находим все реально прокручиваемые контейнеры и замораживаем их,
        // КРОМЕ тех, что находятся внутри оверлея модалки — иначе мы бы
        // заблокировали и внутренний скролл самого окна. Оверлеи модалок
        // помечены data-modal-overlay (см. модалки настроек).
        const root = document.getElementById('root') || document.body;
        const isInsideModal = (el) => {
            let n = el;
            while (n && n !== root) {
                if (n.dataset && n.dataset.modalOverlay !== undefined) return true;
                n = n.parentElement;
            }
            return false;
        };
        const scrollers = Array.from(root.querySelectorAll('.overflow-y-auto, .overflow-auto'))
            .filter((el) => el.scrollHeight > el.clientHeight)
            .filter((el) => !isInsideModal(el));
        const restore = scrollers.map((el) => {
            const prev = el.style.overflow;
            el.style.overflow = 'hidden';
            return { el, prev };
        });

        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevHtmlOverflow;
            restore.forEach(({ el, prev }) => { el.style.overflow = prev; });
        };
    }, [active]);
}
