import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { VOICE_MODE_PHASE } from '@/shared/lib/useVoiceMode';

// ==========================================
// VoiceModeOrb — центральный элемент Voice Mode
// ==========================================
// ПЕРЕПИСАНО (баг «орб не пульсирует во время речи», финальный заход):
// раньше каждая фаза управляла масштабом СВОИМ GSAP-твином, а фоновое
// «дыхание» ставилось на паузу и возобновлялось из cleanup'ов — эта
// хрупкая связка твинов ломалась (дыхание возобновлялось поверх речи,
// либо твины конфликтовали за свойство scale), и во время речи орб стоял.
//
// Теперь всё проще и надёжнее: ОДИН requestAnimationFrame-цикл на весь
// срок жизни компонента. Каждый кадр он смотрит на ТЕКУЩУЮ фазу (через
// ref) и пишет transform/opacity НАПРЯМУЮ в style элементов. Никаких
// конкурирующих твинов на scale, никаких пауз/возобновлений — пока
// страница видима и rAF идёт, орб гарантированно живёт по фазе. Речь
// пульсирует по реальной огибающей голоса (см. useVoiceModeSpeech), а
// без неё — по синусоиде. Цвет меняется CSS-переходом фона (см. render).

const PHASE_COLORS = {
    idle:      { from: '#c4b5fd', to: '#5b32d4' },
    listening: { from: '#5eead4', to: '#5b32d4' },
    thinking:  { from: '#93c5fd', to: '#5b32d4' },
    speaking:  { from: '#22d3ee', to: '#5b32d4' },
    error:     { from: '#fca5a5', to: '#dc2626' },
    limit:     { from: '#f87171', to: '#b91c1c' },
};

export function VoiceModeOrb({ phase, analyserRef, speechAudioRef, speechEnvelopeRef, onClick, size = 200, interruptSignal = 0 }) {
    const coreRef = useRef(null);
    const halo1Ref = useRef(null);
    const halo2Ref = useRef(null);
    const rippleRef = useRef(null);
    const firstInterruptRef = useRef(true);

    // Актуальная фаза для цикла (без пересоздания цикла на каждую смену фазы).
    const phaseRef = useRef(phase);
    phaseRef.current = phase;
    // Плавно сглаженный уровень (для listening/speaking) и данные анализатора.
    const smoothRef = useRef(0);
    const analyserDataRef = useRef(null);
    // Короткий «отскок» при перебивании: время до которого действует.
    const recoilRef = useRef(0);

    // ---- Единый анимационный цикл ----
    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let raf = null;
        const t0 = performance.now();

        const apply = (scale, h1extra, h2extra, h1a, h2a) => {
            // Отскок при перебивании (см. interruptSignal ниже).
            const now = performance.now();
            if (recoilRef.current > now) {
                const k = (recoilRef.current - now) / 320; // 1 → 0
                scale *= 1 - 0.12 * Math.max(0, Math.min(1, k));
            }
            const core = coreRef.current;
            if (core) core.style.transform = `scale(${scale})`;
            const h1 = halo1Ref.current;
            if (h1) { h1.style.transform = `scale(${scale + h1extra})`; h1.style.opacity = String(h1a); }
            const h2 = halo2Ref.current;
            if (h2) { h2.style.transform = `scale(${scale + h2extra})`; h2.style.opacity = String(h2a); }
        };

        const loop = () => {
            const now = performance.now();
            const t = (now - t0) / 1000;
            const ph = phaseRef.current;

            if (reduce) {
                apply(1, 0.14, 0.28, 0.28, 0.2);
                raf = requestAnimationFrame(loop);
                return;
            }

            if (ph === VOICE_MODE_PHASE.LISTENING) {
                const an = analyserRef?.current;
                let lvl = 0;
                if (an) {
                    if (!analyserDataRef.current || analyserDataRef.current.length !== an.frequencyBinCount) {
                        analyserDataRef.current = new Uint8Array(an.frequencyBinCount);
                    }
                    an.getByteFrequencyData(analyserDataRef.current);
                    let s = 0;
                    for (let i = 0; i < analyserDataRef.current.length; i++) s += analyserDataRef.current[i];
                    lvl = s / analyserDataRef.current.length / 255;
                }
                const target = Math.min(lvl * 0.9, 0.4);
                smoothRef.current += (target - smoothRef.current) * 0.2;
                apply(1 + smoothRef.current, 0.06, 0.12, 0.32 + smoothRef.current, 0.24 + smoothRef.current);
            } else if (ph === VOICE_MODE_PHASE.THINKING) {
                const p = 0.5 + 0.5 * Math.sin(t * 4.6);
                apply(1 + 0.09 * p, 0.05, 0.1, 0.3 + 0.1 * p, 0.22 + 0.08 * p);
            } else if (ph === VOICE_MODE_PHASE.SPEAKING) {
                const env = speechEnvelopeRef?.current;
                const el = speechAudioRef?.current;
                let target = 0;
                if (env && el && env.duration > 0) {
                    const ct = el.currentTime || 0;
                    const idx = Math.min(env.peaks.length - 1, Math.max(0, Math.floor((ct / env.duration) * env.peaks.length)));
                    target = env.peaks[idx] || 0;
                } else {
                    target = 0.5 + 0.3 * Math.sin(now / 180);
                }
                // «Живой пол»: даже в паузах речи орб дышит, но громкие слоги
                // перебивают пол — движение остаётся в тон голосу.
                const floor = 0.18 + 0.08 * Math.sin(now / 240);
                target = Math.max(target, floor);
                // Быстрая атака, медленный спад — как у аудио-визуализаторов.
                const k = target > smoothRef.current ? 0.5 : 0.14;
                smoothRef.current += (target - smoothRef.current) * k;
                const lvl = Math.min(smoothRef.current, 1);
                apply(1 + lvl * 0.34, 0.08, 0.15, 0.3 + lvl * 0.4, 0.22 + lvl * 0.32);
            } else if (ph === VOICE_MODE_PHASE.ERROR || ph === VOICE_MODE_PHASE.LIMIT) {
                smoothRef.current = 0;
                apply(1, 0.1, 0.2, 0.28, 0.2);
            } else {
                // IDLE — спокойное дыхание.
                smoothRef.current = 0;
                const b = 0.5 + 0.5 * Math.sin(t * 1.35);
                apply(1 + 0.05 * b, 0.14 + 0.04 * b, 0.28 + 0.05 * b, 0.24 + 0.06 * b, 0.16 + 0.05 * b);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => { if (raf) cancelAnimationFrame(raf); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Перебивание: расходящееся кольцо + отскок ядра ----
    useEffect(() => {
        if (firstInterruptRef.current) { firstInterruptRef.current = false; return undefined; }
        const ring = rippleRef.current;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // Отскок ядра делаем через цикл (recoilRef), а не GSAP — иначе цикл
        // тут же перезапишет transform.
        recoilRef.current = performance.now() + 320;
        if (reduce || !ring) return undefined;
        gsap.killTweensOf(ring);
        gsap.fromTo(ring,
            { scale: 0.82, autoAlpha: 0.7 },
            { scale: 2, autoAlpha: 0, duration: 0.6, ease: 'power2.out' });
        return undefined;
    }, [interruptSignal]);

    const c = PHASE_COLORS[phase] || PHASE_COLORS.idle;
    const px = `${size}px`;
    return (
        <button
            onClick={onClick}
            type="button"
            className="relative flex items-center justify-center shrink-0 focus:outline-none"
            style={{ width: px, height: px }}
            aria-label="Voice Mode"
        >
            <div ref={halo1Ref} className="absolute inset-0 rounded-full pointer-events-none will-change-transform" style={{ background: `radial-gradient(circle, ${c.from}, transparent 70%)`, transition: 'background 0.5s ease' }} />
            <div ref={halo2Ref} className="absolute inset-0 rounded-full pointer-events-none will-change-transform" style={{ background: `radial-gradient(circle, ${c.to}, transparent 70%)`, transition: 'background 0.5s ease' }} />
            <div ref={rippleRef} className="absolute inset-0 rounded-full pointer-events-none border-2" style={{ borderColor: '#5eead4', opacity: 0 }} />
            <div
                ref={coreRef}
                className="rounded-full shadow-xl will-change-transform"
                style={{ width: px, height: px, background: `radial-gradient(circle at 32% 28%, ${c.from}, ${c.to} 70%, ${c.to})`, transition: 'background 0.5s ease' }}
            />
        </button>
    );
}
