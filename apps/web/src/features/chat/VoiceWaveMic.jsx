import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '@/shared/lib/motion';

// ==========================================
// VoiceWaveMic — визуализатор записи голоса
// ==========================================
// Переработка ради ощущения дороже и аккуратнее. Что изменилось и почему:
//
// 1. РОСТ ОТ ЦЕНТРА, а не от низа. Бары растягиваются в обе стороны от
//    средней линии (origin-center), как в современных диктофонах и
//    голосовых сообщениях. Ряд «прыгающих вверх» столбиков читается как
//    эквалайзер из аудиоплеера нулевых; симметричная волна — как звук.
//
// 2. ЦЕНТРАЛЬНОЕ ВЗВЕШИВАНИЕ. Бары у краёв приглушены (окно Ханна), так
//    что волна имеет форму веретена и мягко затухает к краям, а не
//    обрывается вертикальной стеной. Это единственная причина, по которой
//    случайный шум начинает выглядеть как осмысленная форма.
//
// 3. АСИММЕТРИЧНОЕ СГЛАЖИВАНИЕ: быстрая атака (0.5) и медленный спад
//    (0.15) вместо прежнего симметричного 0.22/0.78. Волна мгновенно
//    откликается на начало слога и мягко опадает в паузе — так работают
//    стрелочные индикаторы уровня. Симметричное сглаживание всегда даёт
//    «кашу», отстающую от голоса.
//
// 4. Высота анимируется через gsap.quickTo по scaleY — один
//    переиспользуемый твин на бар вместо создания новых на каждый кадр.
//    React в анимацию не вовлечён вовсе: ни одного useState в цикле.

const BARS = 28;

// Окно Ханна: 0 по краям, 1 в центре. Даёт волне форму веретена.
const WEIGHTS = Array.from({ length: BARS }, (_, i) =>
    0.35 + 0.65 * Math.sin((Math.PI * i) / (BARS - 1)) ** 1.5
);

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
        const reduce = prefersReducedMotion();

        // При reduced-motion волна не пляшет: ставим ровный спокойный ряд.
        // Факт «идёт запись» и так передан цветом кнопки и таймером —
        // движение здесь декоративное, его можно убрать без потери смысла.
        if (reduce) {
            gsap.set(bars, { scaleY: 0.3 });
            return undefined;
        }

        settersRef.current = Array.from(bars).map((bar) =>
            gsap.quickTo(bar, 'scaleY', { duration: 0.12, ease: 'power3.out' })
        );

        let dataArr = null;
        const ATTACK = 0.5;
        const RELEASE = 0.15;

        const tick = () => {
            const analyser = analyserRef?.current;
            const smoothed = smoothedRef.current;
            phaseRef.current += 0.045;

            if (analyser) {
                if (!dataArr || dataArr.length !== analyser.frequencyBinCount) {
                    dataArr = new Uint8Array(analyser.frequencyBinCount);
                }
                analyser.getByteFrequencyData(dataArr);
                // Голос сосредоточен в нижних ~60% бинов — этот диапазон и
                // делим на полосы, по одной на бар.
                const usable = Math.floor(dataArr.length * 0.6) || dataArr.length;
                const perBar = Math.max(1, Math.floor(usable / BARS));
                for (let i = 0; i < BARS; i++) {
                    let sum = 0;
                    const start = i * perBar;
                    for (let j = 0; j < perBar; j++) sum += dataArr[start + j] || 0;
                    const level = sum / perBar / 255;
                    const k = level > smoothed[i] ? ATTACK : RELEASE;
                    smoothed[i] += (level - smoothed[i]) * k;
                }
            } else {
                for (let i = 0; i < BARS; i++) smoothed[i] *= 0.9;
            }

            for (let i = 0; i < BARS; i++) {
                // Покой — очень тихая волна, идущая слева направо: ряд не
                // мёртвый, но и не претендует на внимание.
                const idle = 0.16 + Math.sin(phaseRef.current + i * 0.38) * 0.05;
                const active = Math.min(smoothed[i] * 2.4, 1) * WEIGHTS[i];
                const scale = Math.max(idle, active);
                settersRef.current[i]?.(scale);
            }

            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserRef]);

    return (
        <div ref={containerRef} className={`w-full flex items-center justify-center gap-[3px] h-7 ${className}`}>
            {Array.from({ length: BARS }).map((_, i) => (
                <span
                    key={i}
                    className="void-wave-bar block w-[3px] h-full rounded-full bg-current"
                    style={{ transform: 'scaleY(0.16)', transformOrigin: 'center', willChange: 'transform' }}
                />
            ))}
        </div>
    );
}
