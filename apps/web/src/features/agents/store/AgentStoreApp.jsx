import { useState } from 'react';
import { CockpitView } from '@/features/cockpit/CockpitView';
import { StoreCard } from '@/features/agents/store/StoreCard';
import { StoreDrawer } from '@/features/agents/store/StoreDrawer';
import { StoreSidebar } from '@/features/agents/store/StoreSidebar';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { AGENT_STORE, ORCHESTRATOR_PRODUCTS } from '@/shared/config/agents';
import { createAgentConfig, generateOrchestratorEmail, getOrchestratorLimit, getAgentLimit, canUseOrchestrators, ORCHESTRATOR_BUILD_FEE } from '@/shared/config/orchestrator';
import { generateUniqueAgentName } from '@/shared/lib/agent-naming';
import { goBack } from '@/shared/lib/navigation';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// «АГЕНТЫ» — единая вкладка: Cockpit + магазин + биллинг
// ==========================================
// Бывшие «Магазин агентов» и «Управление агентами» объединены. Главная
// страница (landing) вкладки — Cockpit со всем прежним функционалом.
// Сверху — поле поиска по агентам (фильтрует и Cockpit, и магазин).
// Снизу — три кнопки навигации, как в старом магазине, но «Мои агенты» и
// «Магазин агентов» поменялись местами (иконки и логика): первая теперь
// ведёт в Cockpit, вторая — в обновлённый магазин без «профессий», где
// для выбора остались строго два вида: Оркестраторы и Агенты.
export function AgentStoreApp({ state, updateState }) {
    const [nav, setNav] = useState('my');              // my (Cockpit — лендинг) | store | billing
    const [query, setQuery] = useState('');
    const [drawerItem, setDrawerItem] = useState(null);
    const [drawerPremium, setDrawerPremium] = useState(false);
    const [showTopUp, setShowTopUp] = useState(false);
    const [limitNotice, setLimitNotice] = useState(null);   // { title, text } — предложение обновить тариф

    const balance = state.walletBalance || 0;
    const agents = state.aiAgents || [];
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const workersCount = agents.filter(a => a.kind !== 'orchestrator').length;
    const plan = state.userPlan || 'free';
    const planTitle = (id) => ({ free: 'Free', plus: 'Plus', pro: 'Pro', pro_plus: 'Ultra', ultra: 'Ultra' }[id] || 'Free');

    const matchesQuery = (a) => query.trim() === '' || a.name.toLowerCase().includes(query.trim().toLowerCase());
    const visibleAgents = AGENT_STORE.filter(matchesQuery);
    const visibleOrchestrators = ORCHESTRATOR_PRODUCTS.filter(matchesQuery);

    // --- Покупки ---
    const openDrawer = (item, premium) => { setDrawerItem(item); setDrawerPremium(premium); };
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
            activePresets: [],
            color: '#5b32d4',                  // единый фирменный фиолетовый по умолчанию
            nodes: [], edges: [], isPaid: true, status: 'active',
            mailboxes: [], mailbox: null, messenger: null,
            createdAt: now, updatedAt: now,
        };
        updateState({
            walletBalance: balance - agent.price,
            walletTransactions: [{ id: 'tx' + now, type: 'agent_fee', amount: -agent.price, description: `Покупка агента «${newAgent.name}»`, timestamp: now }, ...(state.walletTransactions || [])],
            aiAgents: [...agents, newAgent], activeAgentId: newAgent.id,
        });
        closeDrawer(); setNav('my');
    };

    const buyOrchestrator = () => {
        // Оркестраторы доступны с тарифа Plus: на Plus — РОВНО ОДИН (лимит
        // покупки: максимум 1, больше купить нельзя), Pro — до 3, Ultra — до 5.
        if (!canUseOrchestrators(plan)) {
            setLimitNotice({
                title: 'Оркестраторы недоступны',
                text: 'Оркестраторы доступны с тарифа Plus и выше (на Plus — ровно один). Обновите тариф, чтобы покупать и использовать оркестраторов.',
            });
            return;
        }
        const limit = getOrchestratorLimit(plan);
        if (orchestrators.length >= limit) {
            setLimitNotice({
                title: 'Достигнут лимит оркестраторов',
                text: plan === 'plus'
                    ? 'На тарифе «Plus» можно приобрести ровно одного оркестратора — он у вас уже есть. Чтобы добавить больше, обновите тариф до Pro или Ultra.'
                    : `На тарифе «${planTitle(plan)}» доступно оркестраторов: ${limit}. Чтобы добавить больше, обновите тариф.`,
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
                {/* Шапка: поле поиска агентов — наверху вкладки «Агенты» */}
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard shrink-0">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0" title="Назад в Хаб"><Icons.ChevronLeft /></button>
                    <div className="relative flex-1 min-w-0 max-w-xl">
                        <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по агентам…" className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors" />
                    </div>
                    <button onClick={() => updateState({ currentView: 'wallet' })} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold"><Icons.Wallet className="w-4 h-4" /> {formatMoney(balance)} ₽</button>
                </div>

                <div className="flex-1 overflow-y-auto pb-20 sm:pb-6">
                    {/* ЛЕНДИНГ вкладки «Агенты» — Cockpit (бывшее управление агентами) */}
                    {nav === 'my' && (
                        <CockpitView
                            state={state}
                            updateState={updateState}
                            embedded
                            searchQuery={query}
                            onGoStore={() => setNav('store')}
                        />
                    )}

                    {/* МАГАЗИН: строго два вида — Оркестраторы и Агенты */}
                    {nav === 'store' && (
                        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
                            {/* Оркестраторы */}
                            {visibleOrchestrators.length > 0 && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-sm font-extrabold bg-gradient-to-r from-[#5b32d4] to-[#a52fe0] bg-clip-text text-transparent">Оркестраторы</span>
                                        <span className="text-[11px] font-bold text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20 px-2 py-0.5 rounded-full">Премиум</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {visibleOrchestrators.map((o, i) => (
                                            <StoreCard key={o.id} item={o} premium index={i} onOpen={(it) => openDrawer(it, true)} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Агенты */}
                            {visibleAgents.length > 0 && (
                                <>
                                    <p className="text-sm font-extrabold dark:text-white mb-3">Агенты</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {visibleAgents.map((a, i) => (
                                            <StoreCard key={a.id} item={a} index={i} onOpen={(it) => openDrawer(it, false)} />
                                        ))}
                                    </div>
                                </>
                            )}

                            {visibleAgents.length === 0 && visibleOrchestrators.length === 0 && (
                                <div className="text-center text-gray-400 py-16">
                                    <Icons.Store className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-sm">По запросу ничего не найдено</p>
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

            <StoreDrawer item={drawerItem} premium={drawerPremium} balance={balance} onBuy={onBuy} onClose={closeDrawer} />

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
        </div>
    );
}
