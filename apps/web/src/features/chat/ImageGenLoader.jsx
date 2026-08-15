import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// ImageGenLoader — анимация генерации изображения (GSAP)
// ==========================================
// Логотип из анимации убран намеренно: он перетягивал внимание и делал
// плашку «фирменной заставкой» вместо спокойного индикатора работы.
// Теперь это «проявляющийся холст»: мягкий градиентный отблеск ходит по
// диагонали, поверх него медленно дышат три размытых цветовых пятна, а
// снизу ползёт тонкая полоска прогресса. Все анимации — закольцованные
// tween'ы с repeat:-1, создаются один раз (никакой рекурсии и
// пересоздания таймлайнов на каждой итерации) и чистятся через scope
// useGSAP. prefers-reduced-motion уважаем.
//
// Размер плашки совпадает с размером готовой картинки (см. GeneratedImage,
// max-w-[15rem] sm:max-w-[17rem] + aspect-square) — интерфейс не «прыгает»
// в момент подмены скелетона на результат.

export function ImageGenLoader({ lang = 'ru' }) {
    const scope = useRef(null);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        // Диагональный световой свип по холсту.
        gsap.fromTo('.igl-sweep',
            { xPercent: -140 },
            { xPercent: 140, duration: 1.8, ease: 'power2.inOut', repeat: -1 });

        // Три размытых пятна дышат вразнобой — создаёт ощущение, что
        // изображение «проявляется», без единого резкого движения.
        gsap.to('.igl-blob-1', { scale: 1.35, x: 12, y: -8, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        gsap.to('.igl-blob-2', { scale: 1.25, x: -14, y: 10, duration: 3.1, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.4 });
        gsap.to('.igl-blob-3', { scale: 1.4, x: 6, y: 12, duration: 2.9, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.8 });

        // Точки у подписи.
        gsap.to('.igl-dot', { autoAlpha: 1, y: -3, duration: 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.15, repeat: -1 } });
    }, { scope });

    const label = lang === 'en' ? 'Creating image' : lang === 'zh' ? '正在生成图片' : 'Создаю изображение';

    return (
        <div ref={scope} className="flex gap-3 max-w-4xl fade-in">
            <div className="bg-white dark:bg-darkBg p-4 md:p-5 rounded-3xl rounded-tl-sm w-full max-w-[15rem] sm:max-w-[17rem]">
                <div className="flex items-center gap-1.5 mb-3">
                    <span className="igl-dot w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 opacity-40" />
                    <span className="igl-dot w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 opacity-40" />
                    <span className="igl-dot w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 opacity-40" />
                    <span className="text-xs font-bold text-[#5b32d4] dark:text-purple-300 ml-1">{label}</span>
                </div>

                <div className="igl-canvas relative w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-[#f4f1fd] to-[#e6e0f7] dark:from-purple-900/20 dark:to-purple-900/[0.08]">
                    {/* Цветовые пятна «проявляющегося» изображения */}
                    <span className="igl-blob-1 absolute left-[18%] top-[22%] w-20 h-20 rounded-full bg-[#5b32d4]/25 blur-2xl" />
                    <span className="igl-blob-2 absolute right-[16%] top-[38%] w-24 h-24 rounded-full bg-fuchsia-400/25 blur-2xl" />
                    <span className="igl-blob-3 absolute left-[34%] bottom-[16%] w-20 h-20 rounded-full bg-sky-400/25 blur-2xl" />
                    {/* Диагональный отблеск */}
                    <span className="igl-sweep absolute inset-y-[-30%] w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/55 dark:via-white/10 to-transparent" />
                </div>

            </div>
        </div>
    );
}
