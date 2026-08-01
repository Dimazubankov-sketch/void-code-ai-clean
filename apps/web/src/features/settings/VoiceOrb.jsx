import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация построена на GSAP-таймлайне (см. gsap-timeline skill): круг
// мягко «дышит» (scale + лёгкое смещение) и переливается яркостью, а
// вокруг пульсируют два ореола. При смене голоса цвета обновляются через
// gsap.to() плавным переходом, а не резким свопом. Всё создаётся в
// useGSAP() со scope — очистка при размонтировании автоматическая
// (gsap-react skill). Уважаем prefers-reduced-motion: при включённом
// «уменьшить движение» оставляем статичный круг без бесконечных твинов.

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128 }) {
    const scope = useRef(null);
    const coreRef = useRef(null);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        // Дыхание ядра — бесконечный yoyo-таймлайн
        gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } })
            .to('.orb-core', { scale: 1.06, duration: 2.4 }, 0)
            .to('.orb-core', { filter: 'brightness(1.15)', duration: 2.4 }, 0)
            .to('.orb-core', { y: -4, duration: 3.0 }, 0);

        // Два ореола расходятся и гаснут по очереди
        gsap.fromTo('.orb-halo-1',
            { scale: 0.9, autoAlpha: 0.35 },
            { scale: 1.35, autoAlpha: 0, duration: 2.8, ease: 'power1.out', repeat: -1 });
        gsap.fromTo('.orb-halo-2',
            { scale: 0.9, autoAlpha: 0.25 },
            { scale: 1.5, autoAlpha: 0, duration: 2.8, ease: 'power1.out', repeat: -1, delay: 1.4 });
    }, { scope });

    // Плавно переливаем цвета при смене голоса (contextSafe не нужен —
    // зависимость передаётся в useGSAP, revertOnUpdate перезапустит эффект).
    useGSAP(() => {
        const core = coreRef.current;
        if (!core) return;
        gsap.to(core, {
            background: `radial-gradient(circle at 30% 30%, ${colorFrom}, ${colorTo} 65%, #2a1f5e)`,
            duration: 0.6,
            ease: 'power2.out',
        });
    }, { scope, dependencies: [colorFrom, colorTo] });

    // Реакция на активную запись/проигрыш — чуть ускоряем и усиливаем пульс
    useGSAP(() => {
        const core = coreRef.current;
        if (!core) return;
        gsap.to('.orb-halo-1, .orb-halo-2', { scale: active ? 1.1 : 1, duration: 0.4 });
    }, { scope, dependencies: [active] });

    const px = `${size}px`;
    return (
        <div ref={scope} className="relative flex items-center justify-center" style={{ width: px, height: px }}>
            <div className="orb-halo-1 absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${colorFrom}, transparent 70%)` }} />
            <div className="orb-halo-2 absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${colorTo}, transparent 70%)` }} />
            <div
                ref={coreRef}
                className="orb-core rounded-full shadow-lg will-change-transform"
                style={{ width: px, height: px, background: `radial-gradient(circle at 30% 30%, ${colorFrom}, ${colorTo} 65%, #2a1f5e)` }}
            />
        </div>
    );
}
