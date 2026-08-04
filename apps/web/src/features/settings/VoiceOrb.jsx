import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Концепция пассивной (idle) анимации ПЕРЕДЕЛАНА по прямому запросу:
// раньше это было «дыхание» — плавное затухание/разгорание яркости и
// прозрачности ореолов (opacity/brightness pulse). Пользователю не
// понравилось именно ощущение затухания. Новая идея — «вращающаяся
// энергетическая сфера»: сам круг медленно и БЕСКОНЕЧНО вращается вокруг
// своей оси (конический градиент едет по кругу — ощущение внутреннего
// движения энергии), а вокруг орбитой летают две маленькие светящиеся
// точки на разных радиусах и с разной скоростью. Никаких fade in/out —
// только непрерывное вращательное движение, которое не «затухает» и не
// «разгорается», а всегда одинаково живое.
//
// Активная (audio-reactive) часть НЕ ТРОНУТА: если передан audioElement,
// Web Audio API (AudioContext + AnalyserNode) по-прежнему синхронизирует
// масштаб/яркость круга с реальной громкостью речи в реальном времени —
// это работает поверх пассивного вращения (вращение продолжается, амплитуда
// добавляется как доп. scale/brightness).

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128, audioElement = null }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const gradientRef = useRef(null);
    const satellite1Ref = useRef(null);
    const satellite2Ref = useRef(null);

    // ---- Пассивная анимация: вращение градиента + орбитальные спутники ----
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        // Внутренний конический градиент крутится бесконечно и линейно
        // (ease: 'none') — постоянная скорость создаёт ощущение спокойного
        // непрерывного вращения энергии внутри сферы, без ускорений/
        // замираний, которые выглядели бы как «дыхание».
        const rotateTl = gsap.to('.orb-gradient', {
            rotation: 360,
            duration: 8,
            repeat: -1,
            ease: 'none',
            transformOrigin: '50% 50%',
        });

        // Два спутника вращаются вокруг ядра по своим орбитам — в разные
        // стороны и с разной скоростью, чтобы движение не выглядело
        // механически синхронным. Каждый спутник — точка на краю своего
        // wrapper-div, а вращается сам wrapper (transform-origin в центре).
        const sat1Tl = gsap.to('.orb-satellite-1-wrap', {
            rotation: 360,
            duration: 6,
            repeat: -1,
            ease: 'none',
            transformOrigin: '50% 50%',
        });
        const sat2Tl = gsap.to('.orb-satellite-2-wrap', {
            rotation: -360,
            duration: 9,
            repeat: -1,
            ease: 'none',
            transformOrigin: '50% 50%',
        });

        return () => { rotateTl?.kill(); sat1Tl?.kill(); sat2Tl?.kill(); };
    }, { scope });

    // ---- Плавная смена цвета голоса ----
    const buildGradient = (from, to) =>
        `conic-gradient(from 0deg, ${from}, ${to}, ${from})`;

    useGSAP(() => {
        const grad = gradientRef.current;
        if (!grad) return;
        gsap.to(grad, {
            background: buildGradient(colorFrom, colorTo),
            duration: 0.6,
            ease: 'power2.out',
        });
    }, { scope, dependencies: [colorFrom, colorTo] });

    // ---- Реакция на «active» (запись/проигрыш) — ускоряем вращение спутников ----
    useGSAP(() => {
        gsap.to('.orb-satellite-1-wrap, .orb-satellite-2-wrap', {
            timeScale: active ? 1.8 : 1,
            duration: 0.4,
        });
    }, { scope, dependencies: [active] });

    // ---- Web Audio API: пульсация круга под реальную громкость речи ----
    // Работает поверх пассивного вращения — ядро дополнительно немного
    // растёт/светлеет на пиках громкости, а вращение градиента и спутников
    // продолжается независимо (разные trasnform-свойства не конфликтуют:
    // rotation крутит .orb-gradient/.orb-satellite-*-wrap, а scale/filter
    // применяются к .orb-core).
    useEffect(() => {
        if (!audioElement) return;

        let ctx = null;
        let analyser = null;
        let source = null;
        let rafId = 0;
        let stopped = false;

        const setScale = gsap.quickTo(coreRef.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const setBrightness = gsap.quickTo(coreRef.current, 'filter', {
            duration: 0.15,
            ease: 'power2.out',
            modifiers: { filter: (v) => `brightness(${v})` },
        });

        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.75;
            source = ctx.createMediaElementSource(audioElement);
            source.connect(analyser);
            analyser.connect(ctx.destination);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.debug('[VoiceOrb] Web Audio недоступен:', e?.message);
            return;
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        let smoothed = 0;
        const tick = () => {
            if (stopped) return;
            analyser.getByteFrequencyData(data);
            let sum = 0;
            const N = Math.min(30, data.length);
            for (let i = 0; i < N; i++) sum += data[i];
            const avg = sum / N / 255;
            smoothed = smoothed * 0.7 + avg * 0.3;
            const scale = 1 + smoothed * 0.18;
            const brightness = 1 + smoothed * 0.35;
            setScale(scale);
            setBrightness(brightness);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            stopped = true;
            cancelAnimationFrame(rafId);
            try { source?.disconnect(); } catch { /* ignore */ }
            try { analyser?.disconnect(); } catch { /* ignore */ }
            try { ctx?.close(); } catch { /* ignore */ }
        };
    }, [audioElement]);

    const px = `${size}px`;
    const satelliteSize = Math.round(size * 0.09);
    const orbitRadius = size / 2 + satelliteSize; // спутник летает чуть за краем ядра

    return (
        <div ref={scope} className="relative flex items-center justify-center" style={{ width: px, height: px }}>
            {/* Ядро — фиксированный размер, без opacity/scale-дыхания в состоянии покоя */}
            <div
                ref={coreRef}
                className="orb-core relative rounded-full shadow-lg overflow-hidden will-change-transform"
                style={{ width: px, height: px }}
            >
                <div
                    ref={gradientRef}
                    className="orb-gradient absolute inset-[-25%]"
                    style={{ background: buildGradient(colorFrom, colorTo) }}
                />
            </div>

            {/* Спутник 1 — своя орбита-обёртка вращается, точка сидит на краю */}
            <div
                className="orb-satellite-1-wrap absolute inset-0 pointer-events-none"
                style={{ width: px, height: px }}
            >
                <div
                    ref={satellite1Ref}
                    className="absolute rounded-full shadow-md"
                    style={{
                        width: satelliteSize,
                        height: satelliteSize,
                        background: colorFrom,
                        top: '50%',
                        left: '50%',
                        transform: `translate(-50%, -50%) translateX(${orbitRadius}px)`,
                        boxShadow: `0 0 8px 2px ${colorFrom}`,
                    }}
                />
            </div>

            {/* Спутник 2 — другой радиус и направление вращения */}
            <div
                className="orb-satellite-2-wrap absolute inset-0 pointer-events-none"
                style={{ width: px, height: px }}
            >
                <div
                    ref={satellite2Ref}
                    className="absolute rounded-full shadow-md"
                    style={{
                        width: satelliteSize * 0.75,
                        height: satelliteSize * 0.75,
                        background: colorTo,
                        top: '50%',
                        left: '50%',
                        transform: `translate(-50%, -50%) translateX(${orbitRadius * 0.82}px) translateY(${orbitRadius * 0.3}px)`,
                        boxShadow: `0 0 6px 2px ${colorTo}`,
                    }}
                />
            </div>
        </div>
    );
}
