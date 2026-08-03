import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ScrollDownButton — плавающая кнопка «прокрутить вниз»
// ==========================================
// Появляется, когда пользователь отскроллил чат от последнего сообщения.
//
// Дизайн:
// - фон полупрозрачный (bg-white/40 + backdrop-blur-md) — кнопка не
//   отвлекает от текста, но чётко видна на любом фоне;
// - обводка полупрозрачная (border-white/40 или border-gray-700/40 в dark);
// - ИКОНКА стрелки — полностью непрозрачная (opacity: 100%),
//   потому что backdrop-blur применяется к контейнеру, а SVG внутри
//   рисуется поверх и не смешивается с задним планом.
//
// Появление/исчезновение — через GSAP:
// - монтируется всегда (visible контролирует поведение), но SET на
//   autoAlpha:0 сразу скрывает без прогрева;
// - при visible=true — плавный fromTo (scale 0.7 → 1, opacity 0 → 1,
//   ease "back.out(1.7)" — небольшой overshoot для «живости»);
// - при visible=false — обратная анимация (scale 1 → 0.85, opacity 1 → 0,
//   pointer-events: none в процессе);
// - твин чистится в cleanup чтобы не текла память при быстрых
//   переключениях visible.

export function ScrollDownButton({ visible, bottomPad, onClick, title }) {
    const btnRef = useRef(null);
    const tweenRef = useRef(null);

    useEffect(() => {
        const el = btnRef.current;
        if (!el) return;
        // Начальное состояние — скрыто, чтобы не мигало при первом монтировании.
        if (tweenRef.current == null) {
            gsap.set(el, { autoAlpha: 0, scale: 0.7 });
        }
        tweenRef.current?.kill();
        if (visible) {
            el.style.pointerEvents = 'auto';
            tweenRef.current = gsap.to(el, {
                autoAlpha: 1,
                scale: 1,
                duration: 0.35,
                ease: 'back.out(1.7)',
            });
        } else {
            tweenRef.current = gsap.to(el, {
                autoAlpha: 0,
                scale: 0.85,
                duration: 0.22,
                ease: 'power2.in',
                onComplete: () => {
                    if (el) el.style.pointerEvents = 'none';
                },
            });
        }
        return () => {
            tweenRef.current?.kill();
        };
    }, [visible]);

    return (
        <button
            ref={btnRef}
            onClick={onClick}
            title={title}
            style={{
                bottom: `${bottomPad + 8}px`,
                transition: 'bottom 180ms ease-out',
                // autoAlpha ставит visibility:hidden при opacity=0 — щелчков «мимо» не будет
            }}
            className="absolute left-1/2 -translate-x-1/2 z-30 w-10 h-10 rounded-full
                bg-white/50 dark:bg-darkCard/50
                backdrop-blur-md
                border border-gray-200/60 dark:border-darkBorder/60
                shadow-lg
                flex items-center justify-center
                text-[#5b32d4] dark:text-purple-400
                hover:bg-white/80 dark:hover:bg-darkCard/80
                transition-colors"
        >
            {/* opacity-100 явно — SVG должна быть чёткой даже если контейнер полупрозрачный */}
            <Icons.ChevronDown className="w-5 h-5 opacity-100" />
        </button>
    );
}
