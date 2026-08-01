import { useEffect, useState } from 'react';
import { Icons } from '@/shared/ui/Icons';
import { buildReasoningScript, phaseIntervalMs } from '@/shared/config/reasoningScript';

// ==========================================
// ThinkingIndicator — анимация «размышления» в чате
// ==========================================
// Фразы сменяют друг друга, пока идёт генерация ответа — набор и длина
// сценария зависят от выбранного уровня рассуждений (Low/Medium/High/Max):
// чем выше уровень, тем больше шагов (включая поиск информации и проверку
// источников) и тем дольше идёт цикл — так на тяжёлых уровнях видно, что
// ИИ прорабатывает задачу глубже, а не просто завис.

export function ThinkingIndicator({ lang = 'ru', level = 'medium' }) {
    const phases = buildReasoningScript(level, lang);
    const interval = phaseIntervalMs(level);
    const [idx, setIdx] = useState(0);
    const [longWait, setLongWait] = useState(false);

    useEffect(() => {
        setIdx(0);
        setLongWait(false);
        const timer = setInterval(() => {
            setIdx((i) => (i + 1) % phases.length);
        }, interval);
        // Если размышление затянулось — подсказываем, что система не зависла
        const longTimer = setTimeout(() => setLongWait(true), Math.max(6000, interval * phases.length));
        return () => { clearInterval(timer); clearTimeout(longTimer); };
    }, [phases, interval]);

    const phase = phases[idx];
    const PhaseIcon = Icons[phase.icon] || Icons.Sparkles;

    return (
        <div className="flex gap-3 max-w-3xl fade-in">
            <div className="bg-white dark:bg-darkBg p-4 rounded-3xl rounded-tl-sm flex flex-col gap-1.5 min-w-[180px]">
                <div className="flex items-center gap-2.5">
                    <PhaseIcon className="w-4 h-4 void-thinking-spin shrink-0 text-[#5b32d4] dark:text-purple-400" />
                    <span key={idx} className="void-thinking-fade text-sm font-semibold text-gray-500 dark:text-gray-400">{phase.text}</span>
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
