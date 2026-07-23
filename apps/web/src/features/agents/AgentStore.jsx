import { useState } from 'react';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { AGENT_STORE, AGENT_STORE_CATEGORIES, MAIL_PROVIDERS } from '@/shared/config/agents';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// МАГАЗИН АГЕНТОВ
// ==========================================
// Список готовых агентов вразброс + фильтры по задачам сверху. Пока в продаже
// один агент — «Агент-письма». Перед покупкой агента с почтой пользователь
// выбирает почтовый ящик (Voidops, Gmail, Mail.ru, Яндекс, Outlook, iCloud).

export function AgentStore({ state, updateState, onClose }) {
    const [category, setCategory] = useState('all');
    const [selected, setSelected] = useState(null);   // агент, карточка которого открыта
    const [choosingMailbox, setChoosingMailbox] = useState(false);
    const [mailbox, setMailbox] = useState('voidops');
    const [showTopUp, setShowTopUp] = useState(false);

    const balance = state.walletBalance || 0;
    const visible = AGENT_STORE.filter(a => category === 'all' || a.category === category);

    const buy = (agent) => {
        if (balance < agent.price) { setShowTopUp(true); return; }
        const now = Date.now();
        const newAgent = {
            id: `agent_${now}`,
            name: agent.name,
            kind: 'worker',
            storeId: agent.id,
            nodes: [], edges: [],
            isPaid: true,
            status: 'active',
            mailboxes: agent.needsMailbox ? [mailbox] : [],
            createdAt: now, updatedAt: now,
        };
        updateState({
            walletBalance: balance - agent.price,
            walletTransactions: [
                { id: 'tx' + now, type: 'agent_fee', amount: -agent.price, description: `Покупка агента «${agent.name}»`, timestamp: now },
                ...(state.walletTransactions || []),
            ],
            aiAgents: [...(state.aiAgents || []), newAgent],
            activeAgentId: newAgent.id,
        });
        setChoosingMailbox(false);
        setSelected(null);
        onClose();
    };

    const startBuy = (agent) => {
        if (agent.needsMailbox) { setSelected(agent); setChoosingMailbox(true); }
        else buy(agent);
    };

    return (
        <div className="fixed inset-x-0 top-0 h-app-screen z-[70] bg-black/50 backdrop-blur-sm flex justify-center items-stretch sm:items-center sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-[#f8f9fc] dark:bg-darkBg w-full sm:max-w-2xl sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden sm:max-h-[88vh]" onClick={e => e.stopPropagation()}>
                {/* Шапка */}
                <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 flex items-center justify-center"><Icons.Store className="w-5 h-5 text-[#5b32d4]" /></div>
                        <h3 className="font-extrabold text-lg dark:text-white">Магазин агентов</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.X /></button>
                </div>

                {/* Фильтры по задачам */}
                <div className="flex gap-2 px-5 py-3 overflow-x-auto no-scrollbar bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder shrink-0">
                    {AGENT_STORE_CATEGORIES.map(c => (
                        <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${category === c.id ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{c.label}</button>
                    ))}
                </div>

                {/* Список агентов вразброс */}
                <div className="flex-1 overflow-y-auto p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {visible.map(agent => (
                            <div key={agent.id} className="bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-darkBorder p-5 shadow-sm flex flex-col">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center"><Icons.Mail className="w-6 h-6" /></div>
                                    <div className="min-w-0">
                                        <p className="font-extrabold dark:text-white truncate">{agent.name}</p>
                                        <p className="text-xs text-gray-400 truncate">{agent.tagline}</p>
                                    </div>
                                </div>
                                <ul className="space-y-1.5 mb-4 flex-1">
                                    {agent.abilities.map((ab, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                                            <Icons.Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" /> {ab}
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex items-center justify-between mt-auto">
                                    <span className="font-extrabold text-lg dark:text-white">{formatMoney(agent.price)} ₽</span>
                                    <button onClick={() => startBuy(agent)} className="px-5 py-2.5 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">Купить</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {visible.length === 0 && (
                        <div className="text-center text-gray-400 py-16">
                            <Icons.Store className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-sm">В этой категории пока нет агентов</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Выбор почтового ящика перед покупкой */}
            {choosingMailbox && selected && (
                <div className="fixed inset-0 z-[75] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setChoosingMailbox(false)}>
                    <div className="bg-white dark:bg-darkCard w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                        <h4 className="font-extrabold text-lg dark:text-white mb-1">Выберите почту</h4>
                        <p className="text-sm text-gray-400 mb-5">На какой почте агент будет работать? Позже можно поменять или добавить ещё.</p>
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {MAIL_PROVIDERS.map(p => {
                                const IconC = Icons[p.icon];
                                const active = mailbox === p.id;
                                return (
                                    <button key={p.id} onClick={() => setMailbox(p.id)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${active ? 'border-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20 scale-[1.03]' : 'border-gray-100 dark:border-darkBorder hover:border-gray-200'}`}>
                                        {IconC && <IconC className="w-8 h-8" />}
                                        <span className="text-[11px] font-semibold dark:text-gray-200 text-center leading-tight">{p.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl mb-4">
                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Баланс</span>
                            <span className={`font-bold text-sm ${balance >= selected.price ? 'text-green-600' : 'text-red-500'}`}>{formatMoney(balance)} ₽</span>
                        </div>
                        <button onClick={() => buy(selected)} className="w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors">
                            {balance >= selected.price ? `Купить за ${formatMoney(selected.price)} ₽` : 'Пополнить и купить'}
                        </button>
                    </div>
                </div>
            )}

            {showTopUp && (
                <WalletTopUpModal state={state} updateState={updateState} reason="Пополните баланс, чтобы купить агента." onClose={() => setShowTopUp(false)} />
            )}
        </div>
    );
}
