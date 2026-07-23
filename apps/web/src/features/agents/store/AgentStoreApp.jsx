import { useState } from 'react';
import { AgentBuilderMenu } from '@/features/agents/AgentBuilderMenu';
import { StoreCard } from '@/features/agents/store/StoreCard';
import { StoreDrawer } from '@/features/agents/store/StoreDrawer';
import { StoreSidebar } from '@/features/agents/store/StoreSidebar';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { AGENT_STORE, AGENT_STORE_CATEGORIES, ORCHESTRATOR_PRODUCTS } from '@/shared/config/agents';
import { createAgentConfig, generateOrchestratorEmail, getOrchestratorLimit, getAgentLimit, canUseOrchestrators, ORCHESTRATOR_BUILD_FEE } from '@/shared/config/orchestrator';
import { generateUniqueAgentName } from '@/shared/lib/agent-naming';
import { goBack } from '@/shared/lib/navigation';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';

const initials = (str) => (str || '?').replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 2).toUpperCase();

// ==========================================
// МАГАЗИН АГЕНТОВ — самостоятельное приложение (заменяет конструктор)
// ==========================================
export function AgentStoreApp({ state, updateState }) {
    const [nav, setNav] = useState('store');           // store | my | billing
    const [tab, setTab] = useState('all');
    const [query, setQuery] = useState('');
    const [drawerItem, setDrawerItem] = useState(null);
    const [drawerPremium, setDrawerPremium] = useState(false);
    const [mailbox, setMailbox] = useState('voidops');
    const [messenger, setMessenger] = useState('telegram');
    const [showTopUp, setShowTopUp] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [limitNotice, setLimitNotice] = useState(null);   // { title, text } — предложение обновить тариф

    const balance = state.walletBalance || 0;
    const agents = state.aiAgents || [];
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const workersCount = agents.filter(a => a.kind !== 'orchestrator').length;
    const plan = state.userPlan || 'free';
    const planTitle = (id) => ({ free: 'Free', plus: 'Plus', pro: 'Pro', pro_plus: 'Ultra', ultra: 'Ultra' }[id] || 'Free');

    const matchesQuery = (a) => query.trim() === '' || a.name.toLowerCase().includes(query.trim().toLowerCase());
    const visibleAgents = AGENT_STORE.filter(a => (tab === 'all' || a.category === tab) && matchesQuery(a));
    const showOrchSection = (tab === 'all') && matchesQuery({ name: 'Оркестратор' });

    // --- Покупки ---
    const openDrawer = (item, premium) => { setDrawerItem(item); setDrawerPremium(premium); if (item.needsMailbox) setMailbox('voidops'); if (item.needsMessenger) setMessenger('telegram'); };
    const closeDrawer = () => setDrawerItem(null);

    const buyAgent = (agent) => {
        // Лимит агентов по тарифу: Free — 1, Plus — 5, Pro — 10, Ultra — 20
        const agentLimit = getAgentLimit(plan);
        if (workersCount >= agentLimit) {
            setLimitNotice({
                title: 'Достигнут лимит агентов',
                text: `На тарифе «${planTitle(plan)}» доступно агентов: ${agentLimit}. Чтобы купить больше, обновите тариф.`,
            });
            return;
        }
        if (balance < agent.price) { setShowTopUp(true); return; }
        const now = Date.now();
        const newAgent = {
            id: `agent_${now}`,
            name: generateUniqueAgentName(agents),
            kind: 'worker',
            storeId: agent.id,
            profession: agent.category,        // фиксированная специализация из магазина
            activePresets: [],
            color: '#5b32d4',                  // единый фирменный фиолетовый по умолчанию
            nodes: [], edges: [], isPaid: true, status: 'active',
            mailboxes: agent.needsMailbox ? [mailbox] : [],
            mailbox: agent.needsMailbox ? mailbox : null,
            messenger: agent.needsMessenger ? messenger : null,
            createdAt: now, updatedAt: now,
        };
        updateState({
            walletBalance: balance - agent.price,
            walletTransactions: [{ id: 'tx' + now, type: 'agent_fee', amount: -agent.price, description: `Покупка агента «${agent.name}»`, timestamp: now }, ...(state.walletTransactions || [])],
            aiAgents: [...agents, newAgent], activeAgentId: newAgent.id,
        });
        closeDrawer(); setNav('my');
    };

    const buyOrchestrator = () => {
        // Оркестраторы доступны только с тарифа Pro и выше
        if (!canUseOrchestrators(plan)) {
            setLimitNotice({
                title: 'Оркестраторы недоступны',
                text: 'Оркестраторы доступны с тарифа Pro и выше. Обновите тариф, чтобы покупать и использовать оркестраторов.',
            });
            return;
        }
        const limit = getOrchestratorLimit(plan);
        if (orchestrators.length >= limit) {
            setLimitNotice({
                title: 'Достигнут лимит оркестраторов',
                text: `На тарифе «${planTitle(plan)}» доступно оркестраторов: ${limit}. Чтобы добавить больше, обновите тариф.`,
            });
            return;
        }
        if (balance < ORCHESTRATOR_BUILD_FEE) { setShowTopUp(true); return; }
        const now = Date.now();
        const existingEmails = orchestrators.map(o => o.orchestration?.email).filter(Boolean);
        const email = generateOrchestratorEmail(existingEmails);
        const id = `orch_${now}`;
        const orchestrator = {
            id, name: `Оркестратор ${orchestrators.length + 1}`, kind: 'orchestrator', status: 'active',
            nodes: [], edges: [], isPaid: true, paidAt: now,
            orchestration: { email, subordinateIds: [], soundEnabled: true },
            config: createAgentConfig({ id, kind: 'orchestrator', email }), createdAt: now, updatedAt: now,
        };
        updateState({
            walletBalance: balance - ORCHESTRATOR_BUILD_FEE,
            walletTransactions: [{ id: 'tx' + now, type: 'agent_fee', amount: -ORCHESTRATOR_BUILD_FEE, description: `Покупка оркестратора «${orchestrator.name}»`, timestamp: now }, ...(state.walletTransactions || [])],
            aiAgents: [...agents, orchestrator], activeAgentId: id,
        });
        closeDrawer(); setNav('my');
    };

    const onBuy = (item) => { if (drawerPremium) buyOrchestrator(); else buyAgent(item); };

    return (
        <div className="flex-1 flex h-full bg-[#f8f9fc] dark:bg-darkBg overflow-hidden">
            <StoreSidebar active={nav} onSelect={setNav} />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Шапка: поиск по всем агентам + профиль */}
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard shrink-0">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0" title="Назад в Хаб"><Icons.ChevronLeft /></button>
                    <div className="relative flex-1 min-w-0 max-w-xl">
                        <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по агентам…" className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors" />
                    </div>
                    <button onClick={() => updateState({ currentView: 'wallet' })} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold"><Icons.Wallet className="w-4 h-4" /> {formatMoney(balance)} ₽</button>
                    <button onClick={() => setShowMenu(true)} className="w-9 h-9 rounded-full bg-[#5b32d4] text-white flex items-center justify-center font-bold text-xs shrink-0">{state.user ? initials(state.user.name) : <Icons.User className="w-4 h-4" />}</button>
                </div>

                <div className="flex-1 overflow-y-auto pb-20 sm:pb-6">
                    {nav === 'store' && (
                        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
                            {/* Вкладки по задачам */}
                            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
                                {AGENT_STORE_CATEGORIES.map(c => (
                                    <button key={c.id} onClick={() => setTab(c.id)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${tab === c.id ? 'bg-[#5b32d4] text-white' : 'bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>{c.label}</button>
                                ))}
                            </div>

                            {/* Секция оркестраторов — с акцентом */}
                            {showOrchSection && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-sm font-extrabold bg-gradient-to-r from-[#5b32d4] to-[#a52fe0] bg-clip-text text-transparent">Оркестраторы</span>
                                        <span className="text-[11px] font-bold text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20 px-2 py-0.5 rounded-full">Премиум</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {ORCHESTRATOR_PRODUCTS.map((o, i) => (
                                            <StoreCard key={o.id} item={o} premium index={i} onOpen={(it) => openDrawer(it, true)} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Сетка обычных агентов */}
                            {(tab === 'all' || tab !== 'all') && (
                                <>
                                    {tab === 'all' && <p className="text-sm font-extrabold dark:text-white mb-3">Агенты</p>}
                                    {visibleAgents.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                            {visibleAgents.map((a, i) => (
                                                <StoreCard key={a.id} item={a} index={i} onOpen={(it) => openDrawer(it, false)} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center text-gray-400 py-16">
                                            <Icons.Store className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p className="text-sm">В этой категории пока нет агентов</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {nav === 'my' && (
                        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
                            <h2 className="text-xl font-extrabold dark:text-white mb-4">Мои агенты</h2>
                            {agents.length === 0 ? (
                                <div className="text-center text-gray-400 py-16">
                                    <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-sm">Вы ещё не купили ни одного агента</p>
                                    <button onClick={() => setNav('store')} className="mt-4 px-5 py-2.5 rounded-xl bg-[#5b32d4] text-white font-bold text-sm">В магазин</button>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {agents.map(a => (
                                        <button key={a.id} onClick={() => updateState({ currentView: 'cockpit', activeAgentId: a.id })} className="w-full flex items-center gap-3 bg-white dark:bg-darkCard p-4 rounded-2xl border border-gray-100 dark:border-darkBorder hover:border-[#5b32d4]/40 hover:shadow-sm transition-all text-left">
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${a.kind === 'orchestrator' ? 'bg-gradient-to-br from-[#312a6b] to-[#a52fe0] text-white' : 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4]'}`}>
                                                {a.kind === 'orchestrator' ? <Icons.Robot className="w-5 h-5" /> : <Icons.Robot className="w-5 h-5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-sm dark:text-white truncate">{a.name}</p>
                                                <p className="text-xs text-gray-400 truncate">{a.kind === 'orchestrator' ? (a.orchestration?.email || 'оркестратор') : 'нажмите, чтобы назначить задачу'}</p>
                                            </div>
                                            <Icons.ChevronLeft className="w-4 h-4 text-gray-300 rotate-180 shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {nav === 'billing' && (
                        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
                            <h2 className="text-xl font-extrabold dark:text-white mb-4">Биллинг</h2>
                            <div className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder p-5 mb-4">
                                <p className="text-sm text-gray-400">Баланс кошелька</p>
                                <p className="text-3xl font-extrabold dark:text-white mt-1">{formatMoney(balance)} ₽</p>
                                <button onClick={() => updateState({ currentView: 'wallet' })} className="mt-4 px-5 py-2.5 rounded-xl bg-[#5b32d4] text-white font-bold text-sm">Пополнить</button>
                            </div>
                            <div className="bg-white dark:bg-darkCard rounded-2xl border border-gray-100 dark:border-darkBorder p-5">
                                <p className="text-sm text-gray-400">Тариф</p>
                                <p className="text-lg font-extrabold dark:text-white mt-1 capitalize">{plan}</p>
                                <button onClick={() => updateState({ currentView: 'pricing' })} className="mt-3 text-sm font-bold text-[#5b32d4]">Сменить тариф</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <StoreDrawer item={drawerItem} premium={drawerPremium} mailbox={mailbox} setMailbox={setMailbox} messenger={messenger} setMessenger={setMessenger} balance={balance} onBuy={onBuy} onClose={closeDrawer} />

            {showTopUp && <WalletTopUpModal state={state} updateState={updateState} reason="Пополните баланс, чтобы совершить покупку." onClose={() => setShowTopUp(false)} />}

            {/* Предложение обновить тариф при достижении лимита */}
            {limitNotice && (
                <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={() => setLimitNotice(null)}>
                    <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center shrink-0"><Icons.Info className="w-5 h-5" /></div>
                            <h4 className="font-extrabold text-lg dark:text-white">{limitNotice.title}</h4>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">{limitNotice.text}</p>
                        <div className="flex gap-2">
                            <button onClick={() => setLimitNotice(null)} className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm">Позже</button>
                            <button onClick={() => { setLimitNotice(null); updateState({ currentView: 'pricing' }); }} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">Обновить тариф</button>
                        </div>
                    </div>
                </div>
            )}

            <AgentBuilderMenu
                open={showMenu}
                onClose={() => setShowMenu(false)}
                agents={agents}
                activeAgentId={state.activeAgentId}
                onSelectAgent={() => setShowMenu(false)}
                onNewAgent={() => { setShowMenu(false); setNav('store'); }}
                onDeleteAgent={(id) => updateState({ aiAgents: agents.filter(a => a.id !== id) })}
                onRenameAgent={(id, name) => updateState({ aiAgents: agents.map(a => a.id === id ? { ...a, name } : a) })}
                updateState={updateState}
                state={state}
            />
        </div>
    );
}
