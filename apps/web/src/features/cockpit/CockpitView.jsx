import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { SubordinateLinkMenu } from '@/features/cockpit/SubordinateLinkMenu';
import { MAIL_PROVIDERS, MESSENGERS } from '@/shared/config/agents';
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
    return '#22c55e';
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

// Приветственное окошко с подарочным агентом — показывается ровно один раз,
// при первом входе пользователя в Cockpit, если у него есть незабранный
// агент-подарок. После нажатия «Забрать» агент помечается claimed: true и
// с этого момента отображается в общем списке как обычный агент — больше
// это окошко никогда не появится.
function GiftAgentModal({ agent, onClaim }) {
    const scope = useRef(null);
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        const tl = gsap.timeline();
        tl.from('.gift-card', { autoAlpha: 0, scale: 0.9, y: 20, duration: 0.5, ease: 'back.out(1.7)' })
          .from('.gift-icon', { scale: 0, rotation: -30, duration: 0.5, ease: 'back.out(2)' }, '-=0.25')
          .from('.gift-text > *', { autoAlpha: 0, y: 12, duration: 0.35, stagger: 0.08, ease: 'power2.out' }, '-=0.15');
        // Лёгкое покачивание подарка, пока окно открыто
        gsap.to('.gift-icon', { rotation: 6, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.9 });
    }, { scope });

    return (
        <div ref={scope} className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="gift-card bg-white dark:bg-darkCard rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl">
                <div className="gift-icon w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#5b32d4] to-[#a52fe0] flex items-center justify-center text-3xl">🎁</div>
                <div className="gift-text">
                    <h2 className="text-xl font-extrabold dark:text-white mb-2">Подарок для вас!</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                        Мы дарим вам агента «{agent.name}» — он готов приступить к задачам сразу после того, как вы его заберёте.
                    </p>
                    <button onClick={onClaim} className="w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">
                        Забрать
                    </button>
                </div>
            </div>
        </div>
    );
}

// Раскрытый блок управления агентом. С этого момента агент не настраивается
// тумблерами-пресетами — он выполняет задачи только по промту: либо в личном
// чате с ним, либо получая их от привязанного оркестратора.
function AgentControls({ agent, onUpdate, allAgents }) {
    const [renaming, setRenaming] = useState(false);
    const [nameVal, setNameVal] = useState(agent.name);
    const [nameErr, setNameErr] = useState('');

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

            {/* Ручная смена цвета агента */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Цвет агента</p>
                <div className="flex flex-wrap gap-2">
                    {AGENT_COLORS.map(c => (
                        <button key={c} onClick={() => onUpdate({ color: c })} className={`w-7 h-7 rounded-full transition-transform ${(agent.color || '#5b32d4') === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-darkCard scale-110' : ''}`} style={{ backgroundColor: c }} />
                    ))}
                </div>
            </div>

            {/* Подсказка: агент теперь работает только по промту */}
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <Icons.Info className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                Агент выполняет задачи по промту: напишите ему напрямую в чате или привяжите к оркестратору, чтобы он получал задачи автоматически.
            </div>
        </div>
    );
}

function AgentCard({ agent, expanded, onToggle, onUpdate, onChat, allAgents, index = 0, orchestratorsCount = 0 }) {
    const managingOrchestrator = (allAgents || []).find(a => a.kind === 'orchestrator' && (a.orchestration?.subordinateIds || []).includes(agent.id));
    const label = managingOrchestrator ? `Подчинён «${managingOrchestrator.name}»` : 'Ждёт задачи в чате';
    const color = agent.color || '#5b32d4';
    return (
        <div style={{ animationDelay: `${(orchestratorsCount + index) * 70}ms` }} className="void-pop-up bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder overflow-hidden transition-shadow hover:shadow-sm">
            <div className="flex items-center gap-3 p-4">
                <button onClick={onToggle} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '22', color }}>
                        <Icons.Robot className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-bold text-sm dark:text-white truncate">{agent.name}</p>
                        </div>
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

// embedded=true — Cockpit работает лендингом внутри единой вкладки «Агенты»:
// без своей кнопки «Назад» (навигация уже есть в шапке вкладки), с фильтрацией
// агентов по строке поиска searchQuery из общей шапки; переход «В магазин»
// открывает вкладку магазина внутри того же приложения через onGoStore.
export function CockpitView({ state, updateState, embedded = false, searchQuery = '', onGoStore = null }) {
    const [expandedId, setExpandedId] = useState(null);
    const [linkOrchestrator, setLinkOrchestrator] = useState(null);

    const agents = state.aiAgents || [];
    const q = (searchQuery || '').trim().toLowerCase();
    const matches = (a) => q === '' || (a.name || '').toLowerCase().includes(q);
    // Незабранный агент-подарок скрыт из общего списка — появится там
    // только после того, как пользователь заберёт его в приветственном окне.
    const orchestrators = agents.filter(a => a.kind === 'orchestrator').filter(matches);
    const workers = agents.filter(a => a.kind !== 'orchestrator' && !(a.isGift && !a.claimed)).filter(matches);
    const orchestratorsAllowed = canUseOrchestrators(state.userPlan || 'free');

    const updateAgent = (id, patch) => {
        updateState({ aiAgents: agents.map(a => a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a) });
    };

    // Приветственное окошко с подарком — ровно один раз, при первом входе.
    const pendingGiftAgent = agents.find(a => a.isGift && !a.claimed);
    const [showGiftModal, setShowGiftModal] = useState(false);
    useEffect(() => {
        if (pendingGiftAgent && !state.giftModalShown) setShowGiftModal(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const claimGiftAgent = () => {
        if (!pendingGiftAgent) return;
        updateState({
            aiAgents: agents.map(a => a.id === pendingGiftAgent.id ? { ...a, claimed: true, updatedAt: Date.now() } : a),
            giftModalShown: true,
        });
        setShowGiftModal(false);
    };
    const openChat = (agent) => updateState({ activeAgentId: agent.id, currentView: agent.kind === 'orchestrator' ? 'orchestrator-chat' : 'agent-chat' });
    const goStore = () => onGoStore ? onGoStore() : updateState({ currentView: 'agent-store' });

    return (
        <div className={`flex-1 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in ${embedded ? '' : 'overflow-y-auto'}`}>
            <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
                {/* Шапка + бейдж количества агентов */}
                <div className="flex items-center gap-3 mb-6">
                    {!embedded && (
                        <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    )}
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
                                    <p className="text-xs text-gray-400 truncate">{blocked ? 'Возобновит работу после оплаты тарифа Plus и выше' : (linked > 0 ? `Управляет агентами: ${linked}` : 'Агенты не закреплены')}</p>
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
                        {q !== '' && agents.length > 0 ? (
                            <p className="text-sm font-medium mb-1">По запросу ничего не найдено</p>
                        ) : (
                            <>
                                <p className="text-sm font-medium mb-1">Пока нет агентов</p>
                                <p className="text-xs mb-5">Купите агента в магазине, чтобы назначить ему задачи</p>
                                <button onClick={goStore} className="px-5 py-2.5 rounded-xl bg-[#5b32d4] text-white font-bold text-sm">В магазин агентов</button>
                            </>
                        )}
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

            {showGiftModal && pendingGiftAgent && (
                <GiftAgentModal agent={pendingGiftAgent} onClaim={claimGiftAgent} />
            )}
        </div>
    );
}
