import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ImageGenLoader — анимация генерации изображения (GSAP)
// ==========================================
// Пока картинка создаётся на сервере (DeepInfra), показываем «холст», по
// которому пробегает световой свип, логотип мягко пульсирует и вращается,
// а точки-индикаторы бегут по очереди. Всё собрано в GSAP-таймлайны со
// scope → чистится при размонтировании. Уважаем prefers-reduced-motion.

export function ImageGenLoader({ lang = 'ru' }) {
    const scope = useRef(null);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        // Свет пробегает по холсту слева направо
        gsap.fromTo('.igl-sweep',
            { xPercent: -120 },
            { xPercent: 120, duration: 1.4, ease: 'power1.inOut', repeat: -1 });
        // Логотип «дышит» и мягко покачивается
        gsap.to('.igl-logo', { scale: 1.12, rotation: 6, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        // Точки-индикаторы
        gsap.to('.igl-dot', { autoAlpha: 1, y: -3, duration: 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.15, repeat: -1 } });
        // Лёгкое мерцание рамки холста
        gsap.to('.igl-canvas', { boxShadow: '0 0 0 2px rgba(91,50,212,0.35)', duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }, { scope });

    const label = lang === 'en' ? 'Creating image' : lang === 'zh' ? '正在生成图片' : 'Создаю изображение';

    return (
        <div ref={scope} className="flex gap-3 max-w-4xl fade-in">
            {/* Задача 5: тот же p-4 md:p-5 + rounded-3xl rounded-tl-sm, что и
                у пузыря готового сообщения с картинкой в ChatView, и тот же
                w-full max-w-sm aspect-square, что и у самой готовой
                картинки (см. GeneratedImage) — размеры и пропорции
                скелетона и финальной картинки идентичны, интерфейс не
                «прыгает» при подмене одного на другое. */}
            <div className="bg-white dark:bg-darkBg p-4 md:p-5 rounded-3xl rounded-tl-sm w-full max-w-sm">
                <div className="flex items-center gap-1.5 mb-3">
                    <span className="igl-dot w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 opacity-40" />
                    <span className="igl-dot w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 opacity-40" />
                    <span className="igl-dot w-1.5 h-1.5 rounded-full bg-[#5b32d4]/60 opacity-40" />
                    <span className="text-xs font-bold text-[#5b32d4] dark:text-purple-300 ml-1">{label}</span>
                </div>
                <div className="igl-canvas relative w-full aspect-square rounded-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#efecf9] to-[#e0dbf4] dark:from-purple-900/20 dark:to-purple-900/10">
                    <div className="igl-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent" />
                    <Icons.VoidLogo className="igl-logo w-9 h-9 text-[#5b32d4] dark:text-purple-300 relative z-10" />
                </div>
            </div>
        </div>
    );
}
