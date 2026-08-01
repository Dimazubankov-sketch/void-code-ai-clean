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

        // Два ореола расходятся и приглушаются (не до полного нуля — так
        // круг всегда выглядит «живым», без провалов в пустоту)
        gsap.fromTo('.orb-halo-1',
            { scale: 0.9, autoAlpha: 0.4 },
            { scale: 1.3, autoAlpha: 0.12, duration: 2.8, ease: 'sine.inOut', repeat: -1, yoyo: true });
        gsap.fromTo('.orb-halo-2',
            { scale: 0.95, autoAlpha: 0.3 },
            { scale: 1.45, autoAlpha: 0.1, duration: 3.2, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 0.8 });
    }, { scope });

    // Плавно переливаем цвета при смене голоса. Градиент строится только на
    // оттенках самого голоса (от светлого к более насыщенному) — БЕЗ тёмного,
    // почти чёрного края, чтобы круг не выглядел «потухшим». Даже в самой
    // тёмной точке остаётся приглушённый цвет, а не чернота.
    const buildGradient = (from, to) =>
        `radial-gradient(circle at 32% 28%, ${from}, ${to} 70%, ${to})`;

    useGSAP(() => {
        const core = coreRef.current;
        if (!core) return;
        gsap.to(core, {
            background: buildGradient(colorFrom, colorTo),
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
                style={{ width: px, height: px, background: `radial-gradient(circle at 32% 28%, ${colorFrom}, ${colorTo} 70%, ${colorTo})` }}
            />
        </div>
    );
}
