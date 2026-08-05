import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

// ==========================================
// VoiceWaveMic — визуализатор записи голоса (GSAP-эквалайзер)
// ==========================================
// Полный редизайн: раньше здесь была топорная синус-волна, теперь —
// аккуратный ряд вертикальных баров, каждый из которых «танцует» под
// реальную речь. Высота бара анимируется ИСКЛЮЧИТЕЛЬНО через GSAP
// (gsap.quickTo по scaleY — самый дешёвый способ часто обновлять одно и
// то же свойство 60 раз в секунду, см. gsap-performance skill), без
// единого useState в цикле — React reconciler в анимацию не вовлечён.
//
// Источник сигнала — тот же Web Audio AnalyserNode (analyserRef), что и
// раньше: в rAF-цикле читаем frequencyData, делим на BARS полос и для
// каждой полосы плавно (экспоненциальное сглаживание) двигаем свой бар.
// В тишине бары спокойно и мягко «дышат» на небольшую амплитуду — не
// плоская линия, а живая, но ненавязчивая пульсация; при речи — вырастают
// пропорционально громкости своей частотной полосы.

const BARS = 24;

export function VoiceWaveMic({ analyserRef, className = '' }) {
    const containerRef = useRef(null);
    const rafRef = useRef(0);
    const settersRef = useRef([]);
    const smoothedRef = useRef(new Array(BARS).fill(0));
    const phaseRef = useRef(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const bars = container.querySelectorAll('.void-wave-bar');
        // gsap.quickTo — переиспользуемый тюин на каждый бар вместо
        // создания новых твинов на каждый кадр (см. gsap-performance).
        settersRef.current = Array.from(bars).map((bar) =>
            gsap.quickTo(bar, 'scaleY', { duration: 0.16, ease: 'power2.out' })
        );

        let dataArr = null;

        const tick = () => {
            const analyser = analyserRef?.current;
            const smoothed = smoothedRef.current;
            phaseRef.current += 0.06;

            if (analyser) {
                if (!dataArr || dataArr.length !== analyser.frequencyBinCount) {
                    dataArr = new Uint8Array(analyser.frequencyBinCount);
                }
                analyser.getByteFrequencyData(dataArr);
                // Голос сосредоточен в нижних ~60% бинов — делим этот
                // диапазон на BARS полос, каждый бар отражает свою полосу
                // частот (классический вид эквалайзера).
                const usable = Math.floor(dataArr.length * 0.6) || dataArr.length;
                const perBar = Math.max(1, Math.floor(usable / BARS));
                for (let i = 0; i < BARS; i++) {
                    let sum = 0;
                    const start = i * perBar;
                    for (let j = 0; j < perBar; j++) sum += dataArr[start + j] || 0;
                    const level = sum / perBar / 255;
                    smoothed[i] = smoothed[i] * 0.78 + level * 0.22;
                }
            } else {
                for (let i = 0; i < BARS; i++) smoothed[i] *= 0.9;
            }

            for (let i = 0; i < BARS; i++) {
                const level = smoothed[i];
                // Лёгкое «дыхание» в тишине — синус с индивидуальным фазовым
                // сдвигом на каждый бар, чтобы не пульсировать синхронно.
                const idle = 0.12 + Math.sin(phaseRef.current + i * 0.5) * 0.05;
                const scale = level < 0.02 ? idle : idle + Math.min(level * 2.2, 1) * 0.85;
                settersRef.current[i]?.(scale);
            }

            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserRef]);

    return (
        <div ref={containerRef} className={`w-full flex items-end justify-center gap-[3px] h-6 ${className}`}>
            {Array.from({ length: BARS }).map((_, i) => (
                <span
                    key={i}
                    className="void-wave-bar block w-[3px] h-full rounded-full bg-current origin-bottom"
                    style={{ transform: 'scaleY(0.12)' }}
                />
            ))}
        </div>
    );
}
