import { useEffect, useRef } from 'react';

// ==========================================
// VoiceWaveMic — визуализатор записи голоса в поле ввода чата
// ==========================================
// Показывается на месте текста, когда идёт запись. Поведение:
//   • Тихо → идеально прямая горизонтальная линия по центру.
//   • Говоришь → линия «оживает»: под каждый пик амплитуды у соответствующей
//     точки поднимается синусоидальная волна, пропорциональная громкости.
//     Тише говоришь — волна ниже; громче — выше и «жирнее».
//
// Как рисуем:
//   • SVG-полилиния с 48 точками равномерно распределёнными по ширине.
//   • В requestAnimationFrame читаем frequencyData из analyser (uint8[]).
//   • Считаем «средний уровень» (0..1) для сглаженного тренда — он
//     определяет амплитуду волны И толщину линии.
//   • Каждая точка кроме амплитуды получает индивидуальный фазовый сдвиг,
//     чтобы волна «бежала» слева направо, а не пульсировала синхронно.
//   • Экспоненциальное сглаживание уровня (0.15 от нового + 0.85 от старого)
//     убирает нервный «дребезг» — но в тишине уровень падает к нулю быстро
//     (порог 0.02 → прямая линия).
//
// Никаких useState в rAF-цикле: прямые манипуляции с SVG attribute, чтобы
// не гонять React reconciler 60 раз в секунду.

export function VoiceWaveMic({ analyserRef, className = '' }) {
    const svgRef = useRef(null);
    const pathRef = useRef(null);
    const rafRef = useRef(0);
    const smoothedRef = useRef(0);
    const phaseRef = useRef(0);

    useEffect(() => {
        const path = pathRef.current;
        const svg = svgRef.current;
        if (!path || !svg) return;

        // Ширина/высота viewBox. Реальный размер — по контейнеру,
        // SVG растянется под родителя (preserveAspectRatio: 'none').
        const W = 400;
        const H = 24;
        const midY = H / 2;
        const POINTS = 48;

        // Буфер под frequencyData у analyser, если он появится
        let dataArr = null;

        const tick = () => {
            const analyser = analyserRef?.current;
            let level = 0;
            if (analyser) {
                if (!dataArr || dataArr.length !== analyser.frequencyBinCount) {
                    dataArr = new Uint8Array(analyser.frequencyBinCount);
                }
                analyser.getByteFrequencyData(dataArr);
                // Голос сосредоточен в нижних 30 бинах (100-1000 Гц при
                // sampleRate 44100 и fftSize 512).
                let sum = 0;
                const N = Math.min(30, dataArr.length);
                for (let i = 0; i < N; i++) sum += dataArr[i];
                level = sum / N / 255;
            }
            // Сглаживание — убираем «дребезг»
            smoothedRef.current = smoothedRef.current * 0.85 + level * 0.15;
            const smooth = smoothedRef.current;

            // Фаза волны — бесконечное вращение
            phaseRef.current += 0.14;

            // Амплитуда: в тишине → 0 (прямая линия), при речи → до H/2 * 0.9
            // Небольшой порог 0.02 гарантирует, что фоновый шум не
            // разыгрывает волну (тишина остаётся прямой)
            const targetAmp = smooth < 0.02 ? 0 : Math.min(smooth * 2.4, 1) * (midY * 0.88);
            // Дополнительно берём разные частоты по X — синус + мелкая
            // модуляция, чтобы форма не была скучным «единичным» синусом
            let d = '';
            for (let i = 0; i < POINTS; i++) {
                const x = (i / (POINTS - 1)) * W;
                const t = (i / POINTS) * Math.PI * 4 + phaseRef.current;
                const wave = Math.sin(t) * targetAmp
                    + Math.sin(t * 2.3 + 0.7) * targetAmp * 0.28;
                const y = midY - wave;
                d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(2) + ' ';
            }
            path.setAttribute('d', d);
            // Небольшое утолщение линии на пике громкости — усиливает
            // ощущение «оживания»
            const width = 2 + Math.min(smooth * 4, 2);
            path.setAttribute('stroke-width', width.toFixed(2));

            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserRef]);

    return (
        <div className={`w-full ${className}`}>
            <svg
                ref={svgRef}
                viewBox="0 0 400 24"
                preserveAspectRatio="none"
                className="w-full h-6 block"
            >
                <path
                    ref={pathRef}
                    d="M0 12 L400 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
}
