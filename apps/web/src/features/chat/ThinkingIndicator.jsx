import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { buildReasoningScript, phaseIntervalMs } from '@/shared/config/reasoningScript';

// ==========================================
// ThinkingIndicator — анимация «размышления» в чате (GSAP)
// ==========================================
// Фразы сменяются по таймеру; каждую смену GSAP плавно уводит старую
// строку вверх с затуханием и вводит новую снизу (gsap-core: autoAlpha + y),
// а иконка мягко пульсирует. Набор шагов и темп зависят от выбранного
// уровня рассуждений — на High/Max шагов больше (поиск, проверка
// источников), чтобы было видно: ИИ действительно прорабатывает задачу.
// Всё в useGSAP() со scope → чистится при размонтировании автоматически.
// Три «печатающиеся» точки тоже на GSAP-таймлайне.

export function ThinkingIndicator({ lang = 'ru', level = 'medium' }) {
    const phases = buildReasoningScript(level, lang);
    const interval = phaseIntervalMs(level);
    const scope = useRef(null);
    const textRef = useRef(null);
    const [idx, setIdx] = useState(0);
    const [longWait, setLongWait] = useState(false);

    // Пульс иконки + бегущие точки — заводим один раз
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.to('.ti-icon', { scale: 1.18, rotation: 8, duration: 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        gsap.to('.ti-dot', { autoAlpha: 1, duration: 0.4, stagger: { each: 0.18, repeat: -1, yoyo: true }, ease: 'sine.inOut' });
    }, { scope });

    // Смена фраз по таймеру
    useEffect(() => {
        setIdx(0);
        setLongWait(false);
        const timer = setInterval(() => setIdx((i) => (i + 1) % phases.length), interval);
        const longTimer = setTimeout(() => setLongWait(true), Math.max(6000, interval * phases.length));
        return () => { clearInterval(timer); clearTimeout(longTimer); };
    }, [phases, interval]);

    // Плавный переход фразы при каждой смене idx (revertOnUpdate по зависимости)
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || !textRef.current) return;
        gsap.fromTo(textRef.current,
            { autoAlpha: 0, y: 8 },
            { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' });
    }, { scope, dependencies: [idx] });

    const phase = phases[idx];
    const PhaseIcon = Icons[phase.icon] || Icons.Sparkles;

    return (
        <div ref={scope} className="flex gap-3 max-w-3xl">
            <div className="ti-card bg-white dark:bg-darkBg p-4 rounded-3xl rounded-tl-sm flex flex-col gap-1.5 min-w-[200px]">
                <div className="flex items-center gap-2.5">
                    <PhaseIcon className="ti-icon w-4 h-4 shrink-0 text-[#5b32d4] dark:text-purple-400" />
                    <span ref={textRef} className="text-sm font-semibold text-gray-500 dark:text-gray-400">{phase.text}</span>
                    <span className="flex gap-0.5 items-center">
                        <span className="ti-dot w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 opacity-30" />
                        <span className="ti-dot w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 opacity-30" />
                        <span className="ti-dot w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 opacity-30" />
                    </span>
                </div>
                {longWait && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-6.5 fade-in">
                        {lang === 'en' ? 'Still working — the task is complex, this may take a bit longer.'
                            : lang === 'zh' ? '仍在处理——问题较复杂，可能需要更长时间。'
                            : 'Ещё думаю — задача непростая, это может занять чуть больше времени.'}
                    </p>
                )}
            </div>
        </div>
    );
}
