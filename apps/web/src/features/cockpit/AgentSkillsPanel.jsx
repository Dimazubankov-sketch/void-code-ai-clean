import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { SkillCard } from '@/features/skills/SkillCard';
import { AddTextSkill, AddGithubSkill } from '@/features/skills/SkillsView';

// ==========================================
// AGENT_SKILLS — базовые скиллы, применимые ТОЛЬКО к агентам/оркестраторам
// ==========================================
// Отдельный набор от общих SKILLS (SkillsView.jsx): те написаны для
// обычного ассистентского чата (стиль кода, анимации), а эти — под роль
// исполнителя внутри агента: код, дизайн, маркетинг, живое общение,
// исследование. Хранятся не в state.customSkills, а прямо на объекте
// агента (agent.activeAgentSkills / agent.customAgentSkills) — у каждого
// агента свой набор, они не путаются между собой и с обычными скиллами.
export const AGENT_SKILLS = [
    {
        id: 'agent_code',
        name: 'Код',
        icon: 'Code',
        instruction: 'Пиши чистый, рабочий код без псевдокода и заглушек «TODO». Перед ответом мысленно проверь, что код компилируется/выполняется. Объясняй решение кратко, после кода, а не вместо него. Указывай, какие тесты или проверки стоит прогнать.',
    },
    {
        id: 'agent_design',
        name: 'Дизайн',
        icon: 'Palette',
        instruction: 'Предлагай конкретные визуальные решения: цвета, отступы, типографику, состояния (hover/active/disabled). Избегай общих фраз вроде «сделай красиво» — говори предметно, с конкретными значениями и обоснованием выбора.',
    },
    {
        id: 'agent_marketing',
        name: 'Маркетинг',
        icon: 'Sparkles',
        instruction: 'Формулируй тексты и стратегии с фокусом на пользу для аудитории и конкретный результат (CTR, конверсия, узнаваемость). Предлагай 2–3 варианта формулировки на выбор вместо одного. Избегай штампов и пустых superlatives без подкрепления фактами.',
    },
    {
        id: 'agent_lively',
        name: 'Живое общение',
        icon: 'MessageSquare',
        instruction: 'Общайся как живой собеседник, а не как справочник: короче формулируй, используй естественные обороты речи, не бойся уместной иронии. Не начинай каждый ответ с «Конечно!» или «Отличный вопрос!» — переходи сразу к делу.',
    },
    {
        id: 'agent_research',
        name: 'Исследование',
        icon: 'Search',
        instruction: 'Прежде чем делать вывод, разложи вопрос на составляющие и рассмотри их по отдельности. Явно отделяй факты от предположений. Если данных недостаточно для уверенного вывода — так и скажи, вместо того чтобы гадать с уверенным тоном.',
    },
];

// Собирает системный промпт-довесок для конкретного агента — вызывается
// из buildAgentSystemPrompt рядом с обычными скиллами.
export function buildAgentSkillsInstruction(agent) {
    if (!agent) return '';
    const activeIds = agent.activeAgentSkills || [];
    const custom = agent.customAgentSkills || [];
    const parts = [];
    AGENT_SKILLS.forEach((s) => { if (activeIds.includes(s.id)) parts.push(`[${s.name}] ${s.instruction}`); });
    custom.forEach((s) => { if (s.active) parts.push(`[${s.name}] ${s.instruction}`); });
    if (!parts.length) return '';
    return 'Дополнительные скиллы этого агента (учитывай при ответах):\n' + parts.join('\n');
}

// Панель, идентичная по устройству SkillsPanel (та же логика
// база/свои + добавление), но привязанная к КОНКРЕТНОМУ агенту.
export function AgentSkillsPanel({ state, updateState, agentId }) {
    const [tab, setTab] = useState('base');
    const [adding, setAdding] = useState(null); // null | 'text' | 'github'
    const scope = useRef(null);

    const agent = (state.aiAgents || []).find((a) => a.id === agentId);
    const active = agent?.activeAgentSkills || [];
    const custom = agent?.customAgentSkills || [];

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.from('.agent-skill-card', { autoAlpha: 0, y: 16, duration: 0.35, stagger: 0.05, ease: 'power2.out' });
    }, { scope, dependencies: [tab] });

    const patchAgent = (patch) => {
        updateState({ aiAgents: (state.aiAgents || []).map((a) => (a.id === agentId ? { ...a, ...patch } : a)) });
    };
    const setActive = (next) => patchAgent({ activeAgentSkills: next });
    const setCustom = (next) => patchAgent({ customAgentSkills: next });

    const toggleBase = (id) => setActive(active.includes(id) ? active.filter((s) => s !== id) : [...active, id]);
    const toggleCustom = (id) => setCustom(custom.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
    const removeCustom = (id) => setCustom(custom.filter((s) => s.id !== id));
    const addCustom = (skill) => { setCustom([{ ...skill, id: 'ask_' + Date.now(), active: true }, ...custom]); setAdding(null); };

    if (adding === 'text') return <AddTextSkill onAdd={addCustom} onCancel={() => setAdding(null)} />;
    if (adding === 'github') return <AddGithubSkill onAdd={addCustom} onCancel={() => setAdding(null)} />;

    return (
        <div ref={scope}>
            <div className="flex gap-2 mb-4 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-2xl">
                <button onClick={() => setTab('base')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'base' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500'}`}>Базовые скиллы</button>
                <button onClick={() => setTab('custom')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'custom' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500'}`}>Свои скиллы</button>
            </div>

            {tab === 'base' ? (
                <div className="grid grid-cols-1 gap-3" style={{ alignItems: 'start', gridAutoRows: 'min-content' }}>
                    {AGENT_SKILLS.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} on={active.includes(skill.id)} onToggle={() => toggleBase(skill.id)} />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setAdding('text')} className="agent-skill-card flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <Icons.Plus className="w-4 h-4" /> Текстом
                        </button>
                        <button onClick={() => setAdding('github')} className="agent-skill-card flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <Icons.Github className="w-4 h-4" /> Из GitHub
                        </button>
                    </div>
                    {custom.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">У этого агента пока нет своих скиллов. Добавьте инструкцию текстом или импортируйте из GitHub — она будет применяться только к нему.</p>
                    ) : custom.map((skill) => (
                        <div key={skill.id} className={`agent-skill-card flex items-center gap-3 p-4 rounded-2xl border ${skill.active ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/40' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder'}`}>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm dark:text-white truncate">{skill.name}</p>
                                <p className="text-xs text-gray-400 truncate">{skill.desc || skill.instruction}</p>
                            </div>
                            <button onClick={() => toggleCustom(skill.id)} className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${skill.active ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${skill.active ? 'translate-x-4' : 'translate-x-0'}`} /></button>
                            <button onClick={() => removeCustom(skill.id)} className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 rounded-lg"><Icons.Trash className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
