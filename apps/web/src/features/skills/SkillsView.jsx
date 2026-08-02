import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { goBack } from '@/shared/lib/navigation';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// СКИЛЛЫ — синтаксические инструкции/промты для Void Code AI
// ==========================================
// Скилл — это преднастроенная инструкция, улучшающая качество ответов
// (код, анимации, архитектура и т.д.). Две вкладки:
//  • «Базовые скиллы» — встроенные (SKILLS ниже);
//  • «Свои скиллы» — кастомные, которые пользователь добавляет вручную
//    (текстом) или импортом из GitHub-репозитория.
// Активные скиллы (id базовых + кастомные объекты) учитываются при ответах.

export const SKILLS = [
    { id: 'coding', icon: 'Code', name: 'Кодинг', desc: 'Чистый код уровня Pro: паттерны, читаемость, тесты', instruction: 'Пиши чистый, читаемый код с понятными именами, обработкой ошибок и краткими комментариями. Предлагай тесты, где уместно.' },
    { id: 'animations', icon: 'Sparkles', name: 'Анимации', desc: 'Плавные анимации на GSAP по лучшим практикам', instruction: 'При анимациях используй GSAP: таймлайны, корректные ease, cleanup, prefers-reduced-motion. Анимируй transform/opacity ради 60fps.' },
    { id: 'architecture', icon: 'BarChart', name: 'Архитектура', desc: 'Продуманные архитектурные решения и разбор', instruction: 'Предлагай продуманную архитектуру: разделение ответственности, границы модулей, компромиссы. Объясняй решения кратко.' },
    { id: 'research', icon: 'Search', name: 'Исследование', desc: 'Глубокий разбор и анализ информации', instruction: 'Разбирай задачу по шагам, рассматривай альтернативы, указывай риски и предположения.' },
    { id: 'writing', icon: 'MessageSquare', name: 'Копирайтинг', desc: 'Тексты, документация, письма', instruction: 'Пиши ясно и структурно, под целевую аудиторию, без воды.' },
    { id: 'translate', icon: 'Globe', name: 'Перевод', desc: 'Точный перевод между языками', instruction: 'Переводи точно, сохраняя смысл, тон и терминологию.' },
];

// Собирает текст активных скиллов (базовых + кастомных) в единый блок
// инструкций, который добавляется к системному промпту при ответах.
// Если передан project — добавляются и его изолированные скиллы (работают
// только в чатах этого проекта).
export function buildSkillsInstruction(state, project = null) {
    const activeIds = state.activeSkills || [];
    const custom = state.customSkills || [];
    const parts = [];
    SKILLS.forEach(s => { if (activeIds.includes(s.id)) parts.push(`[${s.name}] ${s.instruction}`); });
    custom.forEach(s => { if (s.active) parts.push(`[${s.name}] ${s.instruction}`); });
    if (project) {
        const pActive = project.activeSkills || [];
        const pCustom = project.customSkills || [];
        SKILLS.forEach(s => { if (pActive.includes(s.id)) parts.push(`[${s.name}] ${s.instruction}`); });
        pCustom.forEach(s => { if (s.active) parts.push(`[${s.name}] ${s.instruction}`); });
    }
    if (parts.length === 0) return '';
    return 'Учитывай активные скиллы (инструкции пользователя):\n' + parts.join('\n');
}

export function SkillsView({ state, updateState }) {
    const lang = state.lang || 'ru';
    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-2 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">{t(lang, 'menu.skills')}</h2>
                </div>
                <p className="text-gray-500 dark:text-gray-400 mb-6 ml-1">Скиллы — это инструкции, которые ассистент учитывает при ответах: качество кода, анимации, архитектура и другое.</p>
                <SkillsPanel state={state} updateState={updateState} />
            </div>
        </div>
    );
}

// Переиспользуемая панель скиллов (в полной вкладке и в модалке «+» чата).
export function SkillsPanel({ state, updateState, projectId = null }) {
    const [tab, setTab] = useState('base');
    const [adding, setAdding] = useState(null); // null | 'text' | 'github'
    const scope = useRef(null);

    // Для проектных скиллов используем отдельные поля состояния проекта.
    const active = projectId
        ? ((state.projects || []).find(p => p.id === projectId)?.activeSkills || [])
        : (state.activeSkills || []);
    const custom = projectId
        ? ((state.projects || []).find(p => p.id === projectId)?.customSkills || [])
        : (state.customSkills || []);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.from('.skill-card', { autoAlpha: 0, y: 16, duration: 0.35, stagger: 0.05, ease: 'power2.out' });
    }, { scope, dependencies: [tab] });

    const patchProject = (patch) => {
        updateState({ projects: (state.projects || []).map(p => p.id === projectId ? { ...p, ...patch } : p) });
    };
    const setActive = (next) => projectId ? patchProject({ activeSkills: next }) : updateState({ activeSkills: next });
    const setCustom = (next) => projectId ? patchProject({ customSkills: next }) : updateState({ customSkills: next });

    const toggleBase = (id) => setActive(active.includes(id) ? active.filter(s => s !== id) : [...active, id]);
    const toggleCustom = (id) => setCustom(custom.map(s => s.id === id ? { ...s, active: !s.active } : s));
    const removeCustom = (id) => setCustom(custom.filter(s => s.id !== id));
    const addCustom = (skill) => { setCustom([{ ...skill, id: 'sk_' + Date.now(), active: true }, ...custom]); setAdding(null); };

    if (adding === 'text') return <AddTextSkill onAdd={addCustom} onCancel={() => setAdding(null)} />;
    if (adding === 'github') return <AddGithubSkill onAdd={addCustom} onCancel={() => setAdding(null)} />;

    return (
        <div ref={scope}>
            {/* Вкладки */}
            <div className="flex gap-2 mb-4 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-2xl">
                <button onClick={() => setTab('base')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'base' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500'}`}>Базовые скиллы</button>
                <button onClick={() => setTab('custom')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'custom' ? 'bg-white dark:bg-darkCard text-[#5b32d4] shadow-sm' : 'text-gray-500'}`}>Свои скиллы</button>
            </div>

            {tab === 'base' ? (
                <div className="grid sm:grid-cols-2 gap-3">
                    {SKILLS.map(skill => {
                        const Icon = Icons[skill.icon] || Icons.Sparkles;
                        const on = active.includes(skill.id);
                        return (
                            <button key={skill.id} onClick={() => toggleBase(skill.id)} className={`skill-card text-left p-4 rounded-2xl border transition-colors ${on ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/40' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder hover:border-gray-200 dark:hover:border-gray-700'}`}>
                                <div className="flex items-start justify-between mb-2">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${on ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400'}`}><Icon className="w-5 h-5" /></div>
                                    <div className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${on ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} /></div>
                                </div>
                                <p className="font-bold text-[15px] dark:text-white">{skill.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{skill.desc}</p>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setAdding('text')} className="skill-card flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <Icons.Plus className="w-4 h-4" /> Текстом
                        </button>
                        <button onClick={() => setAdding('github')} className="skill-card flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <Icons.Github className="w-4 h-4" /> Из GitHub
                        </button>
                    </div>
                    {custom.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Пока нет своих скиллов. Добавьте инструкцию текстом или импортируйте из GitHub.</p>
                    ) : custom.map(skill => (
                        <div key={skill.id} className={`skill-card flex items-center gap-3 p-4 rounded-2xl border ${skill.active ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/40' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder'}`}>
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

function AddTextSkill({ onAdd, onCancel }) {
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [instruction, setInstruction] = useState('');
    const ok = name.trim() && instruction.trim();
    return (
        <div className="space-y-3">
            <button onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 mb-1"><Icons.ChevronLeft className="w-4 h-4" /> Назад</button>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Название скилла" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Краткое описание (необязательно)" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
            <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={5} placeholder="Текст инструкции (промт), который ассистент будет учитывать…" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none" />
            <button onClick={() => onAdd({ name: name.trim(), desc: desc.trim(), instruction: instruction.trim() })} disabled={!ok} className="w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 text-white font-bold text-sm transition-colors">Добавить скилл</button>
        </div>
    );
}

// Импорт скилла из GitHub. Пользователь вводит personal access token (или
// оставляет пустым для публичных репозиториев), мы тянем список его репо
// через GitHub API, он выбирает репозиторий — README подтягивается как
// текст инструкции. Полноценный OAuth-flow — задача на будущее; сейчас
// используется token/username, без хранения секретов на клиенте дольше сессии.
function AddGithubSkill({ onAdd, onCancel }) {
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [repos, setRepos] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const loadRepos = async () => {
        setLoading(true); setError(''); setRepos(null);
        try {
            const headers = token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {};
            const url = token.trim()
                ? 'https://api.github.com/user/repos?per_page=50&sort=updated'
                : `https://api.github.com/users/${encodeURIComponent(username.trim())}/repos?per_page=50&sort=updated`;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('GitHub API ' + res.status);
            const data = await res.json();
            setRepos(data.map(r => ({ id: r.id, name: r.full_name, default_branch: r.default_branch })));
        } catch (e) {
            setError('Не удалось получить репозитории. Проверьте токен или имя пользователя.');
        } finally { setLoading(false); }
    };

    const importRepo = async (repo) => {
        setLoading(true); setError('');
        try {
            const headers = token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {};
            const res = await fetch(`https://api.github.com/repos/${repo.name}/readme`, { headers: { ...headers, Accept: 'application/vnd.github.raw' } });
            const text = res.ok ? await res.text() : '';
            onAdd({
                name: repo.name.split('/')[1] || repo.name,
                desc: 'Импортировано из GitHub: ' + repo.name,
                instruction: (text || `Скилл на основе репозитория ${repo.name}.`).slice(0, 6000),
            });
        } catch (e) {
            setError('Не удалось импортировать репозиторий.');
        } finally { setLoading(false); }
    };

    return (
        <div className="space-y-3">
            <button onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 mb-1"><Icons.ChevronLeft className="w-4 h-4" /> Назад</button>
            {!repos ? (
                <>
                    <div className="p-4 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 flex items-start gap-2.5">
                        <Icons.Github className="w-5 h-5 text-[#5b32d4] shrink-0 mt-0.5" />
                        <p className="text-xs text-[#5b32d4] dark:text-purple-300 leading-relaxed">Введите personal access token для доступа к вашим репозиториям (в т.ч. приватным) или укажите имя пользователя для публичных.</p>
                    </div>
                    <input value={token} onChange={e => setToken(e.target.value)} placeholder="GitHub token (для приватных репо)" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="или имя пользователя (для публичных)" className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button onClick={loadRepos} disabled={loading || (!token.trim() && !username.trim())} className="w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 text-white font-bold text-sm transition-colors">{loading ? 'Загрузка…' : 'Показать репозитории'}</button>
                </>
            ) : (
                <>
                    <p className="text-sm font-bold dark:text-white">Выберите репозиторий:</p>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {repos.map(r => (
                            <button key={r.id} onClick={() => importRepo(r)} disabled={loading} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder hover:border-[#5b32d4]/40 transition-colors text-left">
                                <Icons.Github className="w-4 h-4 text-gray-500 shrink-0" />
                                <span className="flex-1 text-sm font-semibold dark:text-white truncate">{r.name}</span>
                                <Icons.Plus className="w-4 h-4 text-gray-400" />
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
