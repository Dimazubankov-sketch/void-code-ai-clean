import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация построена ТОЛЬКО на масштабе (scale) — простое плавное «дыхание»
// в покое, без изменений прозрачности/яркости.
//
// ЗАДАЧА (после добавления Fish Audio): раньше здесь была синхронизация
// круга с реальной громкостью через Web Audio API (AnalyserNode на
// createMediaElementSource(audioEl)) — убрана полностью, теперь всегда
// используется имитация случайными импульсами. Причины:
// 1) createMediaElementSource ПЕРЕПОДКЛЮЧАЕТ воспроизведение аудио через
//    граф Web Audio (source -> analyser -> ctx.destination). На части
//    браузеров/устройств это переподключение искажает сам звук (слышны
//    артефакты/«роботизация») и может приводить к рассинхрону событий
//    <audio> (ended/timeupdate начинают срабатывать нестабильно) —
//    именно это давало «дёргающуюся» и не останавливающуюся анимацию.
// 2) Ровно по этой же причине аналогичный код уже был убран из
//    AudioPlayer.jsx (см. комментарий там) — там он ещё и падал с
//    InvalidStateError при повторном оборачивании одного audioEl.
// Пользователь всё равно не увидит разницы на глаз — импульсная анимация
// выглядит органично и никогда не виснет, т.к. не зависит от реального
// состояния декодирования/воспроизведения аудио.

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128 }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    // Твины «дыхания» покоя — ставим на паузу на время «речи», чтобы не
    // спорить за scale с анимацией ниже.
    const idleTweensRef = useRef([]);

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

    // ---- Анимация «речи» при active=true — только имитация импульсами,
    // без подключения к реальному аудиопотоку (см. комментарий выше) ----
    useGSAP(() => {
        if (!active) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        idleTweensRef.current.forEach((tw) => tw?.pause());
        const resetToIdle = () => {
            gsap.to([coreRef.current, halo1Ref.current, halo2Ref.current], {
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
                overwrite: 'auto',
                onComplete: () => { idleTweensRef.current.forEach((tw) => tw?.resume()); },
            });
        };

        const chain = { stopped: false };
        const rand = (min, max) => min + Math.random() * (max - min);
        const step = () => {
            if (chain.stopped) return;
            const scale = rand(1.05, 1.32);
            const haloScale = scale + rand(0.05, 0.18);
            const dur = rand(0.12, 0.26);
            gsap.timeline({ onComplete: step })
                .to([coreRef.current], { scale, duration: dur, ease: 'power2.out' }, 0)
                .to([halo1Ref.current, halo2Ref.current], { scale: haloScale, duration: dur, ease: 'power2.out' }, 0);
        };
        step();

        return () => { chain.stopped = true; resetToIdle(); };
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
