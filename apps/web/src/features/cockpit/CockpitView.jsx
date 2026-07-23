import { useState } from 'react';
import { SubordinateLinkMenu } from '@/features/cockpit/SubordinateLinkMenu';
import { AGENT_PROFESSIONS, getProfession, professionStatusLabel, MAIL_PROVIDERS, MESSENGERS } from '@/shared/config/agents';
import { canUseOrchestrators } from '@/shared/config/orchestrator';
import { validateAgentName } from '@/shared/lib/agent-naming';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// COCKPIT — лёгкая панель управления агентами
// ==========================================
// Воздушный, чистый интерфейс (в духе Telegram / Yandex Go). Оркестратор
// всегда сверху с фирменным градиентом и меню привязки. Агенты покупаются в
// магазине под фиксированную специализацию — профессия не меняется. Клик по
// карточке раскрывает пресеты-действия; чат вынесен отдельной иконкой.

// Палитра ручной смены цвета агента
const AGENT_COLORS = ['#5b32d4', '#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a52fe0', '#0ea5e9', '#64748b'];

const statusColor = (agent) => {
    if (agent.isPaid === false) return '#ef4444';
    if ((agent.activePresets || []).length > 0) return '#22c55e';
    return '#94a3b8';
};

// Подключённый сервис (почта/мессенджер), выбранный при покупке — через OAuth
function ConnectedService({ agent }) {
    let provider = null;
    if (agent.mailbox) provider = MAIL_PROVIDERS.find(p => p.id === agent.mailbox);
    else if (agent.messenger) provider = MESSENGERS.find(m => m.id === agent.messenger);
    if (!provider) return null;
    const IconC = Icons[provider.icon];
    return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/50">
            {IconC && <IconC className="w-5 h-5" />}
            <span className="text-xs font-semibold dark:text-gray-200">{provider.name}</span>
            <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 ml-auto"><Icons.Check className="w-3 h-3" /> OAuth</span>
        </div>
    );
}

// Раскрытый блок управления действиями агента
function AgentControls({ agent, onUpdate, allAgents }) {
    const prof = getProfession(agent.profession || 'mail');
    const active = agent.activePresets || [];
    const [renaming, setRenaming] = useState(false);
    const [nameVal, setNameVal] = useState(agent.name);
    const [nameErr, setNameErr] = useState('');

    const togglePreset = (presetId) => {
        const next = active.includes(presetId) ? active.filter(x => x !== presetId) : [...active, presetId];
        onUpdate({ activePresets: next });
    };

    const saveName = () => {
        const check = validateAgentName(nameVal, allAgents, agent.id);
        if (!check.ok) { setNameErr(check.reason); return; }
        onUpdate({ name: nameVal.trim() });
        setRenaming(false); setNameErr('');
    };

    return (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100 dark:border-darkBorder mt-1">
            {/* Переименование с проверкой уникальности */}
            {renaming ? (
                <div>
                    <div className="flex items-center gap-2">
                        <input autoFocus value={nameVal} onChange={e => { setNameVal(e.target.value); setNameErr(''); }} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setRenaming(false); setNameErr(''); } }} className={`flex-1 min-w-0 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border text-sm font-bold dark:text-white outline-none ${nameErr ? 'border-red-400 focus:border-red-500' : 'border-gray-200 dark:border-darkBorder focus:border-[#5b32d4]'}`} />
                        <button onClick={saveName} className="p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 shrink-0"><Icons.Check className="w-4 h-4" /></button>
                    </div>
                    {nameErr && <p className="text-xs text-red-500 mt-1.5 px-1 fade-in">{nameErr}</p>}
                </div>
            ) : (
                <button onClick={() => { setNameVal(agent.name); setRenaming(true); }} className="text-xs font-bold text-[#5b32d4] flex items-center gap-1.5"><Icons.Pencil className="w-3.5 h-3.5" /> Переименовать</button>
            )}

            {/* Подключённый сервис */}
            <ConnectedService agent={agent} />

            {/* Пресеты-действия под фиксированную профессию */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Действия · {prof.name}</p>
                <div className="flex flex-wrap gap-2">
                    {prof.presets.map(preset => {
                        const on = active.includes(preset.id);
                        return (
                            <button key={preset.id} onClick={() => togglePreset(preset.id)} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${on ? 'text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`} style={on ? { backgroundColor: agent.color || '#5b32d4' } : {}}>
                                {on && <span className="mr-1">✓</span>}{preset.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Ручная смена цвета агента */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Цвет агента</p>
                <div className="flex flex-wrap gap-2">
                    {AGENT_COLORS.map(c => (
                        <button key={c} onClick={() => onUpdate({ color: c })} className={`w-7 h-7 rounded-full transition-transform ${(agent.color || '#5b32d4') === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-darkCard scale-110' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function AgentCard({ agent, expanded, onToggle, onUpdate, onChat, allAgents, index = 0, orchestratorsCount = 0 }) {
    const label = professionStatusLabel(agent.profession || 'mail', agent.activePresets || []);
    const color = agent.color || '#5b32d4';
    return (
        <div style={{ animationDelay: `${(orchestratorsCount + index) * 70}ms` }} className="void-pop-up bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder overflow-hidden transition-shadow hover:shadow-sm">
            <div className="flex items-center gap-3 p-4">
                <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '22', color }}>
                        <Icons.Robot className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm dark:text-white truncate">{agent.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor(agent) }} />
                            <span className="text-xs text-gray-400 truncate">{label}</span>
                        </div>
                    </div>
                </button>
                {/* Чат агента — отдельная иконка справа от имени */}
                <button onClick={() => onChat(agent)} className="p-2 rounded-xl text-gray-400 hover:text-[#5b32d4] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0" title="Чат с агентом"><Icons.MessageSquare className="w-4.5 h-4.5 w-5 h-5" /></button>
                <button onClick={onToggle} className="p-1 text-gray-300 shrink-0"><Icons.ChevronLeft className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`} /></button>
            </div>
            {expanded && <AgentControls agent={agent} onUpdate={onUpdate} allAgents={allAgents} />}
        </div>
    );
}

export function CockpitView({ state, updateState }) {
    const [expandedId, setExpandedId] = useState(null);
    const [linkOrchestrator, setLinkOrchestrator] = useState(null);

    const agents = state.aiAgents || [];
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const workers = agents.filter(a => a.kind !== 'orchestrator');
    const orchestratorsAllowed = canUseOrchestrators(state.userPlan || 'free');

    const updateAgent = (id, patch) => {
        updateState({ aiAgents: agents.map(a => a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a) });
    };
    const openChat = (agent) => updateState({ activeAgentId: agent.id, currentView: agent.kind === 'orchestrator' ? 'orchestrator-chat' : 'agent-chat' });

    return (
        <div className="flex-1 overflow-y-auto h-full bg-[#f8f9fc] dark:bg-darkBg fade-in">
            <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
                {/* Шапка + бейдж количества агентов */}
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-extrabold dark:text-white leading-tight">Cockpit</h1>
                        <p className="text-sm text-gray-400">Панель управления агентами</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-full bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 text-xs font-bold">Всего агентов: {agents.length}</span>
                </div>

                {/* Оркестраторы — всегда сверху, с градиентом */}
                {orchestrators.map((orch, oi) => {
                    const linked = (orch.orchestration?.subordinateIds || []).length;
                    // На тарифе ниже Pro оркестраторы заблокированы до оплаты подписки
                    const blocked = !orchestratorsAllowed;
                    return (
                        <div key={orch.id} style={{ animationDelay: `${oi * 70}ms` }} className={`void-pop-up mb-4 rounded-2xl p-[1.5px] ${blocked ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gradient-to-r from-[#312a6b] via-[#3f4dab] to-[#a52fe0]'}`}>
                            <div className={`bg-white dark:bg-darkCard rounded-2xl p-4 flex items-center gap-3 ${blocked ? 'opacity-60' : ''}`}>
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${blocked ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-gradient-to-br from-[#312a6b] to-[#a52fe0] text-white'}`}>
                                    <Icons.Robot className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-extrabold text-sm dark:text-white truncate">{orch.name}</p>
                                        {blocked ? (
                                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">Заблокирован</span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-white bg-gradient-to-r from-[#5b32d4] to-[#a52fe0] px-2 py-0.5 rounded-full shrink-0">Оркестратор</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">{blocked ? 'Возобновит работу после оплаты тарифа Pro и выше' : (linked > 0 ? `Управляет агентами: ${linked}` : 'Агенты не закреплены')}</p>
                                </div>
                                {blocked ? (
                                    <button onClick={() => updateState({ currentView: 'pricing' })} className="px-3 py-2 rounded-xl bg-[#5b32d4] text-white text-xs font-bold shrink-0">Оплатить</button>
                                ) : (
                                    <>
                                        <button onClick={() => openChat(orch)} className="p-2 rounded-xl text-gray-400 hover:text-[#5b32d4] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0" title="Чат с оркестратором"><Icons.MessageSquare className="w-5 h-5" /></button>
                                        <button onClick={() => setLinkOrchestrator(orch)} className="px-3 py-2 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 text-xs font-bold shrink-0 hover:bg-[#e0dbf4] transition-colors">Привязка</button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Обычные агенты */}
                {workers.length === 0 && orchestrators.length === 0 ? (
                    <div className="text-center text-gray-400 py-20">
                        <Icons.Robot className="w-14 h-14 mx-auto mb-4 text-gray-300" />
                        <p className="text-sm font-medium mb-1">Пока нет агентов</p>
                        <p className="text-xs mb-5">Купите агента в магазине, чтобы назначить ему задачи</p>
                        <button onClick={() => updateState({ currentView: 'agent-store' })} className="px-5 py-2.5 rounded-xl bg-[#5b32d4] text-white font-bold text-sm">В магазин агентов</button>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {workers.map((agent, ai) => (
                            <AgentCard
                                key={agent.id}
                                agent={agent}
                                index={ai}
                                orchestratorsCount={orchestrators.length}
                                allAgents={agents}
                                expanded={expandedId === agent.id}
                                onToggle={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
                                onUpdate={(patch) => updateAgent(agent.id, patch)}
                                onChat={openChat}
                            />
                        ))}
                    </div>
                )}
            </div>

            {linkOrchestrator && (
                <SubordinateLinkMenu
                    orchestrator={orchestrators.find(o => o.id === linkOrchestrator.id) || linkOrchestrator}
                    state={state}
                    updateState={updateState}
                    onClose={() => setLinkOrchestrator(null)}
                />
            )}
        </div>
    );
}
