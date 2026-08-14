import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { VOICE_MODE_PHASE } from '@/shared/lib/useVoiceMode';

// ==========================================
// VoiceModeOrb — центральный элемент Voice Mode
// ==========================================
// ВАЖНО (урок из VoiceOrb.jsx во вкладке настроек «Голос»): фаза SPEAKING
// НИКОГДА не подключается к реальному аудиопотоку через AnalyserNode на
// <audio>-элементе (createMediaElementSource) — на части устройств это
// искажает сам звук и роняет события ended/timeupdate. Поэтому речь Сары
// анимируется безопасной имитацией случайными импульсами — тот же
// проверенный паттерн, что и в настройках.
// Фаза LISTENING, наоборот, честно реагирует на РЕАЛЬНЫЙ уровень сигнала
// с сырого потока микрофона (analyserRef из useVoiceRecorder — это
// getUserMedia, а не воспроизведение, подключать его безопасно).

const PHASE_COLORS = {
    idle:         { from: '#c4b5fd', to: '#5b32d4' },
    listening:    { from: '#5eead4', to: '#5b32d4' },
    transcribing: { from: '#5eead4', to: '#5b32d4' },
    thinking:     { from: '#93c5fd', to: '#5b32d4' },
    speaking:     { from: '#22d3ee', to: '#5b32d4' },
    error:        { from: '#fca5a5', to: '#dc2626' },
};

export function VoiceModeOrb({ phase, analyserRef, onClick, size = 200 }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    const idleTweensRef = useRef([]);
    const rafRef = useRef(null);

    // ---- «Дыхание» покоя — играет всегда как база, ставится на паузу
    // другими фазами и возобновляется, когда они заканчиваются ----
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        const coreTween = gsap.to('.vm-orb-core', { scale: 1.05, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        gsap.set('.vm-orb-halo-1', { autoAlpha: 0.28 });
        gsap.set('.vm-orb-halo-2', { autoAlpha: 0.2 });
        const halo1 = gsap.to('.vm-orb-halo-1', { scale: 1.18, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        const halo2 = gsap.to('.vm-orb-halo-2', { scale: 1.3, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.5 });
        idleTweensRef.current = [coreTween, halo1, halo2];
        return () => { coreTween.kill(); halo1.kill(); halo2.kill(); idleTweensRef.current = []; };
    }, { scope });

    // ---- Плавная смена цвета по фазе ----
    useGSAP(() => {
        const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
        if (!coreRef.current) return;
        gsap.to(coreRef.current, {
            background: `radial-gradient(circle at 32% 28%, ${c.from}, ${c.to} 70%, ${c.to})`,
            duration: 0.5,
            ease: 'power2.out',
        });
    }, { scope, dependencies: [phase] });

    // ---- LISTENING: масштаб честно реагирует на реальный уровень
    // сигнала с микрофона (rAF-цикл + gsap.quickTo — часто обновляемое
    // свойство, quickTo рекомендован именно для такого случая) ----
    useEffect(() => {
        if (phase !== VOICE_MODE_PHASE.LISTENING) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());
        const scaleTo = gsap.quickTo(coreRef.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const halo1To = gsap.quickTo(halo1Ref.current, 'scale', { duration: 0.2, ease: 'power2.out' });
        const halo2To = gsap.quickTo(halo2Ref.current, 'scale', { duration: 0.25, ease: 'power2.out' });
        const analyser = analyserRef?.current;
        const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
        const tick = () => {
            if (analyser && data) {
                analyser.getByteFrequencyData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length / 255;
                const scale = 1 + Math.min(avg * 0.9, 0.4);
                scaleTo(scale);
                halo1To(scale + 0.06);
                halo2To(scale + 0.12);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            gsap.to([coreRef.current, halo1Ref.current, halo2Ref.current], {
                scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto',
                onComplete: () => idleTweensRef.current.forEach((tw) => tw?.resume()),
            });
        };
    }, [phase, analyserRef]);

    // ---- THINKING: равномерный, чуть более быстрый пульс (без реальных
    // данных — просто индикатор «обрабатываю») ----
    useGSAP(() => {
        if (phase !== VOICE_MODE_PHASE.THINKING) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());
        const tween = gsap.to(coreRef.current, { scale: 1.08, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        return () => {
            tween.kill();
            gsap.to(coreRef.current, {
                scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto',
                onComplete: () => idleTweensRef.current.forEach((tw) => tw?.resume()),
            });
        };
    }, { scope, dependencies: [phase] });

    // ---- SPEAKING: безопасная имитация импульсами (см. комментарий
    // вверху файла — никогда не подключаем реальный аудиопоток) ----
    useGSAP(() => {
        if (phase !== VOICE_MODE_PHASE.SPEAKING) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());
        const chain = { stopped: false };
        const rand = (min, max) => min + Math.random() * (max - min);
        const step = () => {
            if (chain.stopped) return;
            const scale = rand(1.04, 1.22);
            const dur = rand(0.14, 0.26);
            gsap.timeline({ onComplete: step })
                .to(coreRef.current, { scale, duration: dur, ease: 'power2.out' }, 0)
                .to([halo1Ref.current, halo2Ref.current], { scale: scale + 0.08, duration: dur, ease: 'power2.out' }, 0);
        };
        step();
        return () => {
            chain.stopped = true;
            gsap.to([coreRef.current, halo1Ref.current, halo2Ref.current], {
                scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto',
                onComplete: () => idleTweensRef.current.forEach((tw) => tw?.resume()),
            });
        };
    }, { scope, dependencies: [phase] });

    // ---- ERROR: короткая встряска, затем покой ----
    useGSAP(() => {
        if (phase !== VOICE_MODE_PHASE.ERROR) return undefined;
        const tween = gsap.timeline()
            .to(coreRef.current, { x: -6, duration: 0.06 })
            .to(coreRef.current, { x: 6, duration: 0.06 })
            .to(coreRef.current, { x: -4, duration: 0.06 })
            .to(coreRef.current, { x: 0, duration: 0.06 });
        return () => { tween.kill(); };
    }, { scope, dependencies: [phase] });

    const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
    const px = `${size}px`;
    return (
        <button
            ref={scope}
            onClick={onClick}
            type="button"
            className="relative flex items-center justify-center shrink-0 focus:outline-none"
            style={{ width: px, height: px }}
            aria-label="Говорить"
        >
            <div ref={halo1Ref} className="vm-orb-halo-1 absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${c.from}, transparent 70%)` }} />
            <div ref={halo2Ref} className="vm-orb-halo-2 absolute inset-0 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${c.to}, transparent 70%)` }} />
            <div
                ref={coreRef}
                className="vm-orb-core rounded-full shadow-xl will-change-transform"
                style={{ width: px, height: px, background: `radial-gradient(circle at 32% 28%, ${c.from}, ${c.to} 70%, ${c.to})` }}
            />
        </button>
    );
}
