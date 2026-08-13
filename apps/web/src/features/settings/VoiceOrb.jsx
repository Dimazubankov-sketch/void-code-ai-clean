import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// VoiceOrb — большой «живой» круг во вкладке Голос
// ==========================================
// Анимация построена ТОЛЬКО на масштабе (scale) — простое плавное «дыхание»
// без каких-либо изменений прозрачности/яркости. Раньше круг параллельно
// «дышал» (scale) и «затухал» (opacity/brightness падали), из-за чего
// казалось, что он тускнеет и почти чернеет в паузах — это убрано
// полностью и намеренно: круг должен оставаться ярким и чётким в любой
// момент времени, в покое и во время озвучки. Уважаем
// prefers-reduced-motion.
//
// Активная (audio-reactive) часть: если передан audioElement
// (HTMLAudioElement), подключаем Web Audio API (AudioContext +
// AnalyserNode) и синхронизируем ТОЛЬКО масштаб круга и ореолов с реальной
// громкостью речи в реальном времени (без изменения прозрачности/яркости).
// GSAP используется для плавной интерполяции значений через quickTo (см.
// gsap-performance skill: quickTo избегает создания нового tween на
// каждый requestAnimationFrame).

export function VoiceOrb({ colorFrom, colorTo, active = false, size = 128, audioElement = null }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    // Твины «дыхания» покоя храним в рефе, чтобы можно было ставить их на
    // паузу извне (когда включается аудио-реактивная анимация озвучки) и
    // плавно возобновлять — без этого они «спорили» за scale с quickTo из
    // Web Audio блока ниже, из-за чего круг дёргался/подвисал во время
    // проверки голоса (задача 4 — «анимация отвалилась при тестировании»).
    const idleTweensRef = useRef([]);

    // ---- Пассивная анимация «дыхания» — только scale ----
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;

        // Ядро: простое плавное дыхание — заметно выраженнее, чем раньше
        // (scale 1.06 вместо едва заметного 1.02), но по-прежнему только
        // scale, без brightness/opacity/сдвигов по Y.
        const coreTween = gsap.to('.orb-core', {
            scale: 1.06,
            duration: 2.2,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
        });

        // Ореолы держим на ПОСТОЯННОЙ прозрачности (задаётся один раз,
        // дальше никогда не меняется) — анимируем только их scale, слегка
        // асинхронно с ядром, чтобы дыхание выглядело живым, а не
        // механическим.
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

    // ---- Реакция на «active» (запись/проигрыш) — только масштаб ореолов ----
    useGSAP(() => {
        gsap.to('.orb-halo-1, .orb-halo-2', { scale: active ? 1.1 : 1, duration: 0.4 });
    }, { scope, dependencies: [active] });

    // ---- Web Audio API: пульсация круга под реальную громкость речи ----
    // Только масштаб (ядро + ореолы) — НИКАКИХ изменений прозрачности или
    // brightness, чтобы круг оставался одинаково ярким на любой громкости.
    useEffect(() => {
        if (!audioElement) return;

        // На время активной (аудио-реактивной) анимации ставим твины
        // дыхания покоя на паузу — GSAP останавливает их ровно в текущей
        // фазе, ничего не сбрасывая. Иначе они продолжали бы писать в тот
        // же scale параллельно с quickTo ниже, и круг «дёргался» между
        // двумя конкурирующими анимациями.
        idleTweensRef.current.forEach((tw) => tw?.pause());

        let ctx = null;
        let analyser = null;
        let source = null;
        let rafId = 0;
        let stopped = false;

        // Плавно (GSAP, без скачка) возвращаем ядро и ореолы к scale:1, а
        // затем аккуратно возобновляем твины дыхания покоя — они
        // продолжат ровно с той фазы, на которой были поставлены на
        // паузу, так что переход получается непрерывным, без «прыжков» и
        // обрывов.
        const returnToIdle = () => {
            gsap.to([coreRef.current, halo1Ref.current, halo2Ref.current], {
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
                overwrite: 'auto',
                onComplete: () => { idleTweensRef.current.forEach((tw) => tw?.resume()); },
            });
        };

        // quickTo — оптимальный способ анимировать одно свойство много раз
        // подряд (см. gsap-performance skill). Внутренне GSAP переиспользует
        // один и тот же твин, а не создаёт новый на каждый rAF.
        const setScale = gsap.quickTo(coreRef.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const setHalo1 = gsap.quickTo(halo1Ref.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const setHalo2 = gsap.quickTo(halo2Ref.current, 'scale', { duration: 0.15, ease: 'power2.out' });

        try {
            // AudioContext создаём внутри try — некоторые браузеры
            // (iOS Safari до user-gesture) кинут исключение.
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            // ГЛАВНАЯ ПРИЧИНА, почему реактивной анимации не было видно
            // (задача 1, повторно): свежесозданный AudioContext в
            // Chrome/Safari стартует в состоянии 'suspended', и пока его
            // явно не resume(), analyser.getByteFrequencyData() отдаёт
            // сплошные нули — амплитуда 0 → круг застывает на scale 1
            // (то самое «дыхание просто останавливается, а второй
            // анимации нет»). Резюмируем сразу (мы внутри user-gesture от
            // кнопки «Проверить голос», так что это разрешено).
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256; // 128 бинов — хватает и легковесно
            analyser.smoothingTimeConstant = 0.6;
            source = ctx.createMediaElementSource(audioElement);
            source.connect(analyser);
            // Подключаем к destination чтобы звук всё-таки играл (иначе
            // Web Audio перехватит поток и <audio> замолкнет).
            analyser.connect(ctx.destination);
        } catch (e) {
            // Если MediaElementSource уже был создан для этого <audio>
            // (повторный useEffect), createMediaElementSource кинет
            // InvalidStateError — просто выходим без анимации громкости, но
            // обязательно возвращаем круг к дыханию покоя, иначе он
            // «замирает» в статике до конца озвучки.
            // eslint-disable-next-line no-console
            console.debug('[VoiceOrb] Web Audio недоступен:', e?.message);
            returnToIdle();
            return;
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        // Задача 3 (повторный раунд — было недостаточно заметно):
        // сглаживание было СЛИШКОМ сильным (0.7/0.3), из-за чего
        // амплитуда еле шевелилась и терялась на глаз даже при громкой
        // речи. Снижаем сглаживание (0.45/0.55 — заметно отзывчивее,
        // но без дребезга по одиночным всплескам) и ощутимо увеличиваем
        // диапазоны scale — теперь круг реально «раздувается» в такт
        // словам, а не еле заметно колышется.
        let smoothed = 0;
        const tick = () => {
            if (stopped) return;
            analyser.getByteFrequencyData(data);
            let sum = 0;
            const N = Math.min(30, data.length);
            for (let i = 0; i < N; i++) sum += data[i];
            const avg = sum / N / 255; // 0..1
            smoothed = smoothed * 0.45 + avg * 0.55;
            const scale = 1 + smoothed * 0.75;
            const haloScale = 1 + smoothed * 1.15;
            setScale(scale);
            setHalo1(haloScale);
            setHalo2(haloScale * 1.08);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            stopped = true;
            cancelAnimationFrame(rafId);
            try { source?.disconnect(); } catch { /* ignore */ }
            try { analyser?.disconnect(); } catch { /* ignore */ }
            try { ctx?.close(); } catch { /* ignore */ }
            returnToIdle();
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
