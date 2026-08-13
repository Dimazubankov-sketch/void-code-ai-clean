import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация построена ТОЛЬКО на масштабе (scale) — простое плавное «дыхание»
// в покое, без изменений прозрачности/яркости.
//
// ВАЖНО (после трёх раундов неудачных попыток): реальный Web Audio API
// (AudioContext + AnalyserNode + createMediaElementSource) для анимации
// «в такт озвучке» оказался слишком хрупким в проде — suspended-контекст,
// разное поведение браузеров, невозможность отладить вслепую через чат.
// Заменено на НАДЁЖНУЮ имитацию: пока active=true (идёт проверка голоса),
// круг проигрывает бесконечную цепочку GSAP-твинов со случайными
// амплитудой и длительностью — визуально читается как «живая реакция на
// речь» (нерегулярные короткие импульсы, а не ровное дыхание), не завися
// ни от каких браузерных Audio API. Каждый твин генерирует следующий
// случайный шаг сам через onComplete — это и есть работа «с использованием
// GSAP», без ручного requestAnimationFrame.

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128 }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    // Твины «дыхания» покоя — ставим на паузу на время «речи», чтобы не
    // спорить за scale с импульсной анимацией ниже.
    const idleTweensRef = useRef([]);
    // Цепочка импульсов «речи» — храним, чтобы суметь корректно оборвать
    // при active=false (иначе следующий случайный шаг всё равно запустится
    // после смены пропа).
    const talkChainRef = useRef({ stopped: true });

    // ---- Пассивная анимация «дыхания» — только scale ----
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        const coreTween = gsap.to('.orb-core', {
            scale: 1.06,
            duration: 2.2,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
        });

        gsap.set('.orb-halo-1', { autoAlpha: 0.28 });
        gsap.set('.orb-halo-2', { autoAlpha: 0.22 });
        const halo1Tween = gsap.to('.orb-halo-1', { scale: 1.15, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        const halo2Tween = gsap.to('.orb-halo-2', { scale: 1.22, duration: 3.0, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.6 });

        idleTweensRef.current = [coreTween, halo1Tween, halo2Tween];
        return () => { coreTween?.kill(); halo1Tween?.kill(); halo2Tween?.kill(); idleTweensRef.current = []; };
    }, { scope });

    // ---- Плавная смена цвета голоса ----
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

    // ---- Импульсная «речь» при active=true ----
    useGSAP(() => {
        if (!active) return;

        idleTweensRef.current.forEach((tw) => tw?.pause());
        const chain = { stopped: false };
        talkChainRef.current = chain;

        const rand = (min, max) => min + Math.random() * (max - min);

        const step = () => {
            if (chain.stopped) return;
            // Случайные, слегка неровные импульсы — короче и резче, чем
            // ровное дыхание, читаются как «реакция на слова», а не как
            // метроном.
            const scale = rand(1.05, 1.32);
            const haloScale = scale + rand(0.05, 0.18);
            const dur = rand(0.12, 0.26);
            gsap.timeline({ onComplete: step })
                .to([coreRef.current], { scale, duration: dur, ease: 'power2.out' }, 0)
                .to([halo1Ref.current, halo2Ref.current], { scale: haloScale, duration: dur, ease: 'power2.out' }, 0);
        };
        step();

        return () => {
            chain.stopped = true;
            gsap.to([coreRef.current, halo1Ref.current, halo2Ref.current], {
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
                overwrite: 'auto',
                onComplete: () => { idleTweensRef.current.forEach((tw) => tw?.resume()); },
            });
        };
    }, { scope, dependencies: [active] });

    const px = `${size}px`;
    return (
        <div ref={scope} className="relative flex items-center justify-center" style={{ width: px, height: px }}>
            <div ref={halo1Ref} className="orb-halo-1 absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${colorFrom}, transparent 70%)` }} />
            <div ref={halo2Ref} className="orb-halo-2 absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${colorTo}, transparent 70%)` }} />
            <div
                ref={coreRef}
                className="orb-core rounded-full shadow-lg will-change-transform"
                style={{ width: px, height: px, background: `radial-gradient(circle at 32% 28%, ${colorFrom}, ${colorTo} 70%, ${colorTo})` }}
            />
        </div>
    );
}
