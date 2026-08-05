import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация построена на GSAP: круг мягко «дышит» и переливается яркостью,
// а вокруг пульсируют два ореола. Уважаем prefers-reduced-motion.
//
// (Ранее пробовали заменить «дыхание» на вращающуюся сферу со спутниками,
// но пользователю не понравилось — вернулись к оригинальному «дыханию»
// с двумя пульсирующими ореолами вокруг ядра.)
//
// Активная (audio-reactive) часть: если передан audioElement
// (HTMLAudioElement), подключаем Web Audio API (AudioContext +
// AnalyserNode) и синхронизируем масштаб/opacity круга с реальной
// ГРОМКОСТЬЮ речи в реальном времени. Пока звук играет — круг
// реагирует на амплитуду (тихий момент → маленький и приглушённый,
// громкий → больше и ярче). GSAP используется для плавной интерполяции
// значений через quickTo (см. gsap-performance skill: quickTo избегает
// создания нового tween на каждый requestAnimationFrame).

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128, audioElement = null }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);

    // ---- Пассивная анимация «дыхания» (без затухания ореолов) ----
    // Раньше ореолы одновременно росли и ТУСКНЕЛИ (autoAlpha 0.4→0.12),
    // из-за чего в покое казалось, что круг «затухает». По просьбе
    // пользователя убрали именно это затухание — оставили только плавную
    // пульсацию масштаба (дыхание) с постоянной прозрачностью ореолов.
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        // Дыхание ядра — бесконечный yoyo-таймлайн
        const breathTl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } })
            .to('.orb-core', { scale: 1.06, duration: 2.4 }, 0)
            .to('.orb-core', { filter: 'brightness(1.15)', duration: 2.4 }, 0)
            .to('.orb-core', { y: -4, duration: 3.0 }, 0);

        // Ореолы: устанавливаем фиксированную (постоянную) прозрачность
        // один раз, дальше анимируем ТОЛЬКО scale — никакого autoAlpha,
        // чтобы не создавалось ощущение затухания/угасания.
        gsap.set('.orb-halo-1', { autoAlpha: 0.28 });
        gsap.set('.orb-halo-2', { autoAlpha: 0.22 });
        gsap.fromTo('.orb-halo-1',
            { scale: 0.9 },
            { scale: 1.3, duration: 2.8, ease: 'sine.inOut', repeat: -1, yoyo: true });
        gsap.fromTo('.orb-halo-2',
            { scale: 0.95 },
            { scale: 1.45, duration: 3.2, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 0.8 });

        return () => { breathTl?.kill(); };
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

    // ---- Реакция на «active» (запись/проигрыш) — усиливаем ореолы ----
    useGSAP(() => {
        gsap.to('.orb-halo-1, .orb-halo-2', { scale: active ? 1.1 : 1, duration: 0.4 });
    }, { scope, dependencies: [active] });

    // ---- Web Audio API: пульсация круга под реальную громкость речи ----
    useEffect(() => {
        if (!audioElement) return;

        let ctx = null;
        let analyser = null;
        let source = null;
        let rafId = 0;
        let stopped = false;

        // quickTo — оптимальный способ анимировать одно свойство много раз
        // подряд (см. gsap-performance skill). Внутренне GSAP переиспользует
        // один и тот же твин, а не создаёт новый на каждый rAF.
        const setScale = gsap.quickTo(coreRef.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const setBrightness = gsap.quickTo(coreRef.current, 'filter', {
            duration: 0.15,
            ease: 'power2.out',
            // filter не число — используем строковую интерполяцию через set
            modifiers: {
                filter: (v) => `brightness(${v})`,
            },
        });
        const setHalo1 = gsap.quickTo(halo1Ref.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const setHalo2 = gsap.quickTo(halo2Ref.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const setHalo1Alpha = gsap.quickTo(halo1Ref.current, 'autoAlpha', { duration: 0.15, ease: 'power2.out' });

        try {
            // AudioContext создаём внутри try — некоторые браузеры
            // (iOS Safari до user-gesture) кинут исключение.
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256; // 128 бинов — хватает и легковесно
            analyser.smoothingTimeConstant = 0.75;
            source = ctx.createMediaElementSource(audioElement);
            source.connect(analyser);
            // Подключаем к destination чтобы звук всё-таки играл (иначе
            // Web Audio перехватит поток и <audio> замолкнет).
            analyser.connect(ctx.destination);
        } catch (e) {
            // Если MediaElementSource уже был создан для этого <audio>
            // (повторный useEffect), createMediaElementSource кинет
            // InvalidStateError — просто выходим без анимации громкости.
            // eslint-disable-next-line no-console
            console.debug('[VoiceOrb] Web Audio недоступен:', e?.message);
            return;
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        // Небольшое сглаживание амплитуды через экспоненциальное среднее:
        // от резких скачков графика картинка выглядит нервной, а речь
        // редко даёт «идеально ровный» уровень.
        let smoothed = 0;
        const tick = () => {
            if (stopped) return;
            analyser.getByteFrequencyData(data);
            // Среднее по низкой части спектра — голос в основном 100-1000Гц,
            // это первые ~30 бинов при fftSize=256, sampleRate 44100.
            let sum = 0;
            const N = Math.min(30, data.length);
            for (let i = 0; i < N; i++) sum += data[i];
            const avg = sum / N / 255; // 0..1
            smoothed = smoothed * 0.7 + avg * 0.3;
            // Диапазоны заметно увеличены по просьбе пользователя — раньше
            // реакция на голос была едва заметной (scale макс. 1.18).
            // Теперь круг ощутимо «дышит» в такт озвучке.
            const scale = 1 + smoothed * 0.38;
            const brightness = 1 + smoothed * 0.6;
            const haloScale = 1 + smoothed * 0.65;
            const halo1Alpha = 0.28 + smoothed * 0.55;
            setScale(scale);
            setBrightness(brightness);
            setHalo1(haloScale);
            setHalo2(haloScale * 1.06);
            setHalo1Alpha(halo1Alpha);
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
