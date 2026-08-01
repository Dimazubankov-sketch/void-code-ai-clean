import { useEffect } from 'react';

// ==========================================
// useLockBodyScroll — заморозить прокрутку фона под модалкой
// ==========================================
// Пока открыта модалка (Голос, Личные данные, Лимиты, Языки), фон за ней
// не должен прокручиваться — иначе, листнув, пользователь видит нижнюю
// часть настроек (например, кнопку «Выйти из аккаунта»), а модалка
// «уезжает». Хук фиксирует body на время жизни модалки и аккуратно
// возвращает прежнее значение overflow при закрытии.

export function useLockBodyScroll(active = true) {
    useEffect(() => {
        if (!active) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [active]);
}
