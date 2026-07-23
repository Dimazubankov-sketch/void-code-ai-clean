// ==========================================
// СИСТЕМА ТЕМЫ — переключение «как часы»
// ==========================================
// Почему старый вариант дёргался: в CSS стояло правило `* { transition: ... }`,
// и при смене класса .dark браузер запускал СВОЙ переход на каждом из тысяч
// элементов — они докрашивались вразнобой, отсюда мерцание и рывки.
//
// Новый подход:
// 1. Тема применяется к <html> ещё ДО первой отрисовки (инлайн-скрипт в
//    index.html читает localStorage) — никакой белой вспышки при загрузке.
// 2. Переключение атомарно: на время смены класса все transition/animation
//    глушатся классом .theme-switching, поэтому «полуперекрашенных» элементов
//    не бывает в принципе.
// 3. Там, где браузер поддерживает View Transitions API, вся страница плавно
//    кроссфейдится единым слоем (снимок «до» растворяется в снимок «после») —
//    это одна GPU-композиция вместо тысяч независимых переходов.
// 4. prefers-reduced-motion уважается: таким пользователям — мгновенная смена.

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const syncChrome = (isDark) => {
    // Цвет системной шторки браузера (мобильный Chrome/Safari) и нативных
    // элементов (скроллбары, инпуты) следуют за темой приложения.
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0f0f13' : '#f8f9fc');
};

export const applyTheme = (isDark) => {
    const root = document.documentElement;
    const next = !!isDark;
    if (root.classList.contains('dark') === next) return; // уже в нужной теме

    const swap = () => {
        root.classList.toggle('dark', next);
        syncChrome(next);
    };

    // Плавный кроссфейд всей страницы, если браузер умеет
    if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
        document.startViewTransition(swap);
        return;
    }

    // Фолбэк: мгновенная атомарная смена без единого «хвоста» от transition
    root.classList.add('theme-switching');
    swap();
    // Два кадра: браузер успевает применить новые стили до возврата переходов
    requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.remove('theme-switching'));
    });
};

export const initTheme = () => {
    // Класс .dark уже выставлен пре-пейнт-скриптом в index.html;
    // здесь лишь синхронизируем системный хром под текущее состояние.
    syncChrome(document.documentElement.classList.contains('dark'));
};
