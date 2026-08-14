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
// искажает сам звук и роняет события ended/timeupdate. Речь Сары
// анимируется безопасной имитацией — НО не случайными рывками (см. ниже),
// а плавной многослойной синусоидой, чтобы не «дёргалось».
//
// ВАЖНО #2 (правка после жалобы на краш при закрытии): раньше SPEAKING
// пересоздавал НОВЫЙ gsap.timeline() каждые ~0.15–0.25с рекурсивным
// вызовом step() — это самый вероятный источник краша (лавинообразное
// накопление таймлайнов при частой смене фаз). Теперь ВСЕ фазы используют
// ограниченное число tween'ов с repeat:-1 — они создаются ОДИН раз и
// просто крутятся, ничего не пересоздают на каждый кадр/итерацию.
// Плюс — все точки обращения к DOM-рефам защищены проверкой на null:
// компонент может быть уже размонтирован (Voice Mode закрыли) в момент,
// когда сработает cleanup-функция предыдущего эффекта.

const PHASE_COLORS = {
    idle:      { from: '#c4b5fd', to: '#5b32d4' },
    listening: { from: '#5eead4', to: '#5b32d4' },
    thinking:  { from: '#93c5fd', to: '#5b32d4' },
    speaking:  { from: '#22d3ee', to: '#5b32d4' },
    error:     { from: '#fca5a5', to: '#dc2626' },
    // Лимит озвучки исчерпан — насыщенный статичный красный, БЕЗ анимации
    // вообще (см. эффект LIMIT ниже) — намеренно выглядит иначе, чем
    // мимолётная встряска ERROR, это стоп-сигнал, а не разовый сбой.
    limit:     { from: '#f87171', to: '#b91c1c' },
};

// Возвращает к масштабу 1 и (если передан) возобновляет фоновое «дыхание».
// Общая функция для всех cleanup — с защитой на случай, что рефы уже null
// (компонент размонтирован).
function settleToIdle(coreRef, halo1Ref, halo2Ref, idleTweensRef) {
    const targets = [coreRef.current, halo1Ref.current, halo2Ref.current].filter(Boolean);
    if (!targets.length) {
        idleTweensRef.current.forEach((tw) => tw?.resume());
        return;
    }
    gsap.to(targets, {
        scale: 1, x: 0, duration: 0.3, ease: 'power2.out', overwrite: 'auto',
        onComplete: () => idleTweensRef.current.forEach((tw) => tw?.resume()),
    });
}

export function VoiceModeOrb({ phase, analyserRef, speechAudioRef, speechEnvelopeRef, onClick, size = 200 }) {
    const scope = useRef(null);
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    const idleTweensRef = useRef([]);
    const rafRef = useRef(null);

    // ---- «Дыхание» покоя — база, ставится на паузу другими фазами и
    // возобновляется, когда они заканчиваются ----
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return undefined;
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
    // сигнала с микрофона (rAF-цикл + gsap.quickTo) ----
    useEffect(() => {
        if (phase !== VOICE_MODE_PHASE.LISTENING) return undefined;
        if (!coreRef.current) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());
        const scaleTo = gsap.quickTo(coreRef.current, 'scale', { duration: 0.15, ease: 'power2.out' });
        const halo1To = halo1Ref.current ? gsap.quickTo(halo1Ref.current, 'scale', { duration: 0.2, ease: 'power2.out' }) : null;
        const halo2To = halo2Ref.current ? gsap.quickTo(halo2Ref.current, 'scale', { duration: 0.25, ease: 'power2.out' }) : null;
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
                halo1To?.(scale + 0.06);
                halo2To?.(scale + 0.12);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            settleToIdle(coreRef, halo1Ref, halo2Ref, idleTweensRef);
        };
    }, [phase, analyserRef]);

    // ---- THINKING: равномерный, чуть более быстрый пульс ----
    useGSAP(() => {
        if (phase !== VOICE_MODE_PHASE.THINKING) return undefined;
        if (!coreRef.current) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());
        const tween = gsap.to(coreRef.current, { scale: 1.08, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        return () => {
            tween.kill();
            settleToIdle(coreRef, halo1Ref, halo2Ref, idleTweensRef);
        };
    }, { scope, dependencies: [phase] });

    // ---- SPEAKING: анимация В ТОН реальной озвучке ----
    // Орб пульсирует по НАСТОЯЩЕЙ громкости голоса Сары. Данные берутся не
    // с аудиоэлемента напрямую (createMediaElementSource в этом проекте
    // искажает звук и роняет события — см. шапку файла), а из огибающей,
    // посчитанной заранее из тех же MP3-байтов в useVoiceModeSpeech.
    // Здесь мы лишь читаем audio.currentTime и берём соответствующий пик —
    // это копеечная операция на кадр, на скорость режима не влияет.
    // Если огибающая ещё не досчиталась (первые доли секунды) или декод не
    // удался — плавно «дышим» запасным паттерном, без рывков.
    useEffect(() => {
        if (phase !== VOICE_MODE_PHASE.SPEAKING) return undefined;
        if (!coreRef.current) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());

        const scaleTo = gsap.quickTo(coreRef.current, 'scale', { duration: 0.12, ease: 'power2.out' });
        const h1To = halo1Ref.current ? gsap.quickTo(halo1Ref.current, 'scale', { duration: 0.18, ease: 'power2.out' }) : null;
        const h2To = halo2Ref.current ? gsap.quickTo(halo2Ref.current, 'scale', { duration: 0.24, ease: 'power2.out' }) : null;

        let raf = null;
        let smooth = 0;
        const tick = () => {
            const env = speechEnvelopeRef?.current;
            const el = speechAudioRef?.current;
            let target = 0;
            if (env && el && env.duration > 0) {
                const t = el.currentTime || 0;
                const idx = Math.min(env.peaks.length - 1, Math.max(0, Math.floor((t / env.duration) * env.peaks.length)));
                target = env.peaks[idx] || 0;
            } else {
                // Запасной вариант на время, пока огибающая считается:
                // мягкая синусоида, чтобы орб не стоял мёртвым.
                target = 0.45 + 0.25 * Math.sin(Date.now() / 220);
            }
            // Сглаживание, чтобы не дёргалось на резких пиках.
            smooth += (target - smooth) * 0.35;
            const scale = 1 + Math.min(smooth, 1) * 0.26;
            scaleTo(scale);
            h1To?.(scale + 0.07);
            h2To?.(scale + 0.13);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            settleToIdle(coreRef, halo1Ref, halo2Ref, idleTweensRef);
        };
    }, [phase, speechAudioRef, speechEnvelopeRef]);

    // ---- ERROR: короткая встряска, затем покой ----
    useGSAP(() => {
        if (phase !== VOICE_MODE_PHASE.ERROR) return undefined;
        if (!coreRef.current) return undefined;
        const tween = gsap.timeline()
            .to(coreRef.current, { x: -6, duration: 0.06 })
            .to(coreRef.current, { x: 6, duration: 0.06 })
            .to(coreRef.current, { x: -4, duration: 0.06 })
            .to(coreRef.current, { x: 0, duration: 0.06 });
        return () => { tween.kill(); };
    }, { scope, dependencies: [phase] });

    // ---- LIMIT: лимит озвучки исчерпан — полностью статично, никакого
    // движения (задача явно требует «орб больше не анимирует»). Просто
    // останавливаем фоновое «дыхание» и фиксируем масштаб на 1; цвет уже
    // меняется отдельным эффектом выше (PHASE_COLORS.limit). ----
    useGSAP(() => {
        if (phase !== VOICE_MODE_PHASE.LIMIT) return undefined;
        idleTweensRef.current.forEach((tw) => tw?.pause());
        const targets = [coreRef.current, halo1Ref.current, halo2Ref.current].filter(Boolean);
        if (targets.length) gsap.set(targets, { scale: 1, x: 0 });
        return () => { idleTweensRef.current.forEach((tw) => tw?.resume()); };
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
            aria-label="Voice Mode"
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
