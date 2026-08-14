import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация — ТОЛЬКО плавное «дыхание» в покое (scale), играет ВСЕГДА,
// независимо от того, идёт сейчас воспроизведение пробного голоса или нет.
//
// Раньше при active=true (во время «Проверить голос») дополнительно
// запускалась имитация «речи» случайными импульсами scale — по задаче
// это выглядело как «ужасная, цикличная» анимация (дёргания, не
// прекращающие работу даже после окончания звука) и должно быть убрано
// насовсем. Прежде здесь также была попытка синхронизировать круг с
// реальной громкостью через Web Audio API (AnalyserNode на
// createMediaElementSource(audioEl)) — она искажала сам звук на части
// устройств и роняла события <audio> (ended/timeupdate), что и было
// первопричиной сбоев. Импульсную имитацию, пришедшую ей на замену,
// теперь тоже убираем — остаётся только «дыхание», без реакции на
// проигрывание вообще.
export function VoiceOrb({ colorFrom, colorTo, size = 128 }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);

    // ---- Единственная анимация — «дыхание» покоя, только scale ----
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

        return () => { coreTween?.kill(); halo1Tween?.kill(); halo2Tween?.kill(); };
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
