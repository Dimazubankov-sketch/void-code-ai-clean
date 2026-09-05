import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { prefersReducedMotion } from '@/shared/lib/motion';

// ==========================================
// LiquidMicButton — микрофон чата (задача 6)
// ==========================================
// Правка по референсу ChatGPT (скрины): убрали фиолетовую заливку и
// дышащее гало вокруг кнопки — в ChatGPT микрофон/стоп нейтрально-серые,
// без цветной подсветки и свечения. Форма всё ещё «перетекает» (border-
// radius GSAP-твином от круга к мягкому «сквиру» при записи, эластичный
// ease) — эта часть осталась, просто без цвета и без ореола:
//
//  • Покой — иконка микрофона БЕЗ фона вообще (как в ChatGPT — просто
//    иконка, подложка появляется только по hover).
//  • Запись — нейтральный светло-серый круг/сквир с тёмной иконкой-
//    квадратом (стоп), а не заливка фирменным фиолетовым.
//  • Смена иконки (Mic → Square → Spinner) — по-прежнему короткий
//    scale+fade кроссфейд, а не мгновенная замена.
export function LiquidMicButton({ voice, size = 'md', bordered = false, onStart, title, stopTitle, className = 'relative' }) {
    const btnRef = useRef(null);
    const [iconKind, setIconKind] = useState(iconFor(voice));
    const iconWrapRef = useRef(null);
    const reduce = prefersReducedMotion();

    const dims = { sm: 'w-9 h-9', md: 'w-10 h-10', lg: 'w-11 h-11' }[size] || 'w-10 h-10';
    const iconSize = { sm: 'w-4 h-4', md: 'w-4 h-4', lg: 'w-5 h-5' }[size] || 'w-4 h-4';

    // Форма кнопки — плавный переход круг ↔ мягкий сквир. Цвет фона НЕ
    // анимируем инлайном вообще (в отличие от прежней версии) — теперь
    // это просто Tailwind-классы (idleBgCls ниже), т.к. схема всего два
    // нейтральных состояния (прозрачный / светло-серый), спецэффект в
    // виде анимации фона здесь не нужен — сама форма уже даёт ощущение
    // «жидкости», а цвет can just switch.
    useGSAP(() => {
        const el = btnRef.current;
        if (!el) return;
        if (reduce) {
            gsap.set(el, { borderRadius: voice.recording ? '32%' : '9999px' });
            return;
        }
        gsap.to(el, { borderRadius: voice.recording ? '32%' : '9999px', duration: 0.42, ease: 'elastic.out(1, 0.65)', overwrite: 'auto' });
    }, { dependencies: [voice.recording], scope: btnRef });

    // Кроссфейд иконки при смене состояния (не мгновенная замена).
    useEffect(() => {
        const next = iconFor(voice);
        if (next === iconKind) return;
        if (reduce || !iconWrapRef.current) { setIconKind(next); return; }
        const el = iconWrapRef.current;
        gsap.to(el, {
            scale: 0.5, autoAlpha: 0, duration: 0.12, ease: 'power2.in',
            onComplete: () => {
                setIconKind(next);
                gsap.fromTo(el, { scale: 0.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.22, ease: 'back.out(2.2)' });
            },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [voice.recording, voice.transcribing]);

    const handleClick = () => {
        if (voice.recording) { voice.stop(); return; }
        if (voice.transcribing) return;
        // Короткая аккуратная вибрация только на СТАРТЕ записи (не на
        // остановке — иначе двойная вибрация на каждый тап).
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* noop */ } }
        (onStart || voice.start)();
    };

    // Нейтральная (не фиолетовая) цветовая схема — как в ChatGPT:
    //  • idle — без фона, серая иконка, лёгкий hover-фон;
    //  • recording/transcribing — светло-серый фон, тёмная иконка.
    const idle = !voice.recording && !voice.transcribing;
    const bgCls = idle ? 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800' : 'bg-gray-100 dark:bg-gray-700';
    const textCls = idle ? 'text-gray-600 dark:text-gray-300' : 'text-gray-900 dark:text-white';
    const borderCls = bordered
        ? `border-2 ${idle ? 'border-transparent active:border-gray-300 dark:active:border-gray-600' : 'border-transparent'}`
        : '';

    return (
        <div className={`${dims} shrink-0 ${className}`}>
            <button
                ref={btnRef}
                onClick={handleClick}
                title={voice.recording ? stopTitle : title}
                disabled={voice.transcribing}
                className={`void-tap-target relative ${dims} flex items-center justify-center transition-colors ${bgCls} ${textCls} ${borderCls}`}
            >
                <span ref={iconWrapRef} className="flex items-center justify-center">
                    {iconKind === 'square' && <Icons.Square className={iconSize} />}
                    {iconKind === 'spinner' && <Icons.Spinner className={`${iconSize} animate-spin`} />}
                    {iconKind === 'mic' && <Icons.Mic className={iconSize} />}
                </span>
            </button>
        </div>
    );
}

function iconFor(voice) {
    if (voice.recording) return 'square';
    if (voice.transcribing) return 'spinner';
    return 'mic';
}
