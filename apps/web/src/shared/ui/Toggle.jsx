import { useEffect, useRef, useState } from 'react';

// ==========================================
// Toggle — единый переключатель для всего приложения (задача 4)
// ==========================================
// Раньше каждый экран (Скиллы, Настройки звука, эмоции голоса, панель
// агента в Cockpit и т.д.) рисовал переключатель сам — своей разметкой,
// без «пружинки» (просто CSS transition на transform, бегунок доезжал до
// цели и сразу останавливался). Теперь один компонент везде, с логикой и
// анимацией строго по спеке transitions.dev «Toggle»: бегунок пролетает
// чуть ДАЛЬШЕ конечной точки и слегка возвращается назад, прежде чем
// замереть («double bounce»). Сама CSS-анимация (.t-toggle/.t-toggle-thumb,
// keyframes t-toggle-on/off) лежит в shared/styles/index.css.
//
// useToggleInit ниже — общая логика для обеих версий компонента:
// анимация «double bounce» должна проигрываться при ЛЮБОМ изменении
// checked ПОСЛЕ монтирования — не только когда кликнули по самому
// переключателю, но и если состояние сменилось откуда-то извне (например,
// сброс настроек другой кнопкой). Поэтому вместо флага «кликнули ли по
// мне» сравниваем текущее значение с тем, что было в момент монтирования:
// как только они разошлись хотя бы раз — считаем «инициализированным» и
// дальше разрешаем анимации. На самом первом рендере анимации нет — как и
// требует спека («Add .is-init on first interaction so the off keyframes
// don't play on load»).
function useToggleInit(checked) {
    const [isInit, setIsInit] = useState(false);
    const initialRef = useRef(checked);
    useEffect(() => {
        if (checked !== initialRef.current) setIsInit(true);
    }, [checked]);
    return isInit;
}

// Геометрия трека/бегунка — три размера, под уже существующие в проекте
// варианты (раньше у каждого экрана были слегка разные пиксельные
// значения без единой системы). --toggle-travel считаем под конкретную
// геометрию (ширина трека − диаметр бегунка − 2×отступ), чтобы бегунок
// всегда останавливался ровно у внутреннего края трека.
const SIZES = {
    sm: { track: 'w-10 h-6 p-0.5', thumb: 'w-5 h-5', travel: 16 },
    md: { track: 'w-11 h-6 p-0.5', thumb: 'w-5 h-5', travel: 20 },
    lg: { track: 'w-12 h-7 p-1', thumb: 'w-5 h-5', travel: 20 },
};

export function Toggle({ checked, onChange, disabled = false, title, size = 'lg', className = '' }) {
    const isInit = useToggleInit(checked);
    const cfg = SIZES[size] || SIZES.lg;

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            title={title}
            onClick={() => { if (!disabled) onChange(!checked); }}
            data-on={checked ? 'true' : 'false'}
            style={{ '--toggle-travel': `${cfg.travel}px` }}
            className={`t-toggle void-tap-target relative ${cfg.track} rounded-full shrink-0 flex items-center ${checked ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isInit ? 'is-init' : ''} ${className}`}
        >
            <span className={`t-toggle-thumb block ${cfg.thumb} bg-white rounded-full shadow-sm`} />
        </button>
    );
}

// Вариант-индикатор (сам НЕ кликабельный) — для карточек, где вся зона
// клика уже занята внешним <button> (например, SkillCard.jsx: тап по
// всей верхней части карточки переключает скилл, а этот элемент только
// визуально отражает состояние — вложенный <button> внутри <button>
// был бы невалидным HTML).
export function ToggleIndicator({ checked, size = 'lg', className = '' }) {
    const isInit = useToggleInit(checked);
    const cfg = SIZES[size] || SIZES.lg;

    return (
        <span
            aria-hidden="true"
            data-on={checked ? 'true' : 'false'}
            style={{ '--toggle-travel': `${cfg.travel}px` }}
            className={`t-toggle relative ${cfg.track} rounded-full shrink-0 flex items-center pointer-events-none ${checked ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'} ${isInit ? 'is-init' : ''} ${className}`}
        >
            <span className={`t-toggle-thumb block ${cfg.thumb} bg-white rounded-full shadow-sm`} />
        </span>
    );
}
