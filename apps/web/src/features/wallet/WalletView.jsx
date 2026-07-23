import { useState } from 'react';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { WalletWithdrawModal } from '@/features/wallet/WalletWithdrawModal';
import { LOW_BALANCE_THRESHOLD } from '@/shared/config/agents';
import { formatMoney } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function WalletView({ state, updateState }) {
    const [showTopUp, setShowTopUp] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const balance = state.walletBalance || 0;
    const transactions = state.walletTransactions || [];
    const agents = state.aiAgents || [];

    const formatDate = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const txIcon = (type) => {
        if (type === 'topup') return { icon: Icons.Wallet, cls: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' };
        if (type === 'withdraw') return { icon: Icons.ArrowUp, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' };
        if (type === 'agent_fee') return { icon: Icons.Robot, cls: 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400' };
        if (type === 'token_charge') return { icon: Icons.Sparkles, cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' };
        return { icon: Icons.Receipt, cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500' };
    };

    const statusBadge = (agent) => {
        if (!agent.isPaid) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">Не оплачен</span>;
        if (agent.status === 'suspended') return <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500">Приостановлен</span>;
        return <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">Активен</span>;
    };

    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Кошелёк</h2>
                </div>

                <div className="bg-gradient-to-br from-[#5b32d4] to-[#3d1f96] rounded-[2rem] p-6 shadow-lg mb-6 text-white relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10"></div>
                    <div className="absolute -right-2 -bottom-10 w-24 h-24 rounded-full bg-white/10"></div>
                    <p className="text-sm font-semibold text-white/70 mb-1.5 relative">Баланс кошелька</p>
                    <p className="text-4xl font-extrabold mb-5 relative">{formatMoney(balance)} ₽</p>
                    <div className="flex gap-2.5 relative">
                        <button onClick={() => setShowTopUp(true)} className="flex items-center gap-2 bg-white text-[#5b32d4] font-bold px-5 py-3 rounded-2xl hover:bg-white/90 transition-colors shadow-md">
                            <Icons.Plus className="w-4 h-4" /> Пополнить
                        </button>
                        <button onClick={() => setShowWithdraw(true)} disabled={balance <= 0} className="flex items-center gap-2 bg-white/15 text-white font-bold px-5 py-3 rounded-2xl hover:bg-white/25 disabled:opacity-40 transition-colors border border-white/20">
                            <Icons.ArrowUp className="w-4 h-4" /> Вывести
                        </button>
                    </div>
                </div>

                {balance < LOW_BALANCE_THRESHOLD && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 flex gap-3 items-start mb-6">
                        <Icons.Alert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" style={{width:'20px',height:'20px',minWidth:'20px'}} />
                        <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold leading-relaxed flex-1 min-w-0">Низкий баланс. Активным агентам может не хватить средств на оплату токенов — их работа автоматически приостановится до пополнения.</p>
                    </div>
                )}

                {agents.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-lg font-extrabold dark:text-white mb-3">Мои агенты</h3>
                        <div className="bg-white dark:bg-darkCard rounded-[1.75rem] border border-gray-100 dark:border-darkBorder shadow-sm divide-y divide-gray-50 dark:divide-gray-800">
                            {agents.map(agent => (
                                <button key={agent.id} onClick={() => updateState({ activeAgentId: agent.id, currentView: 'agent-builder' })} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.Robot className="w-4 h-4" /></div>
                                        <span className="font-bold text-sm dark:text-white truncate">{agent.name}</span>
                                    </div>
                                    {statusBadge(agent)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <h3 className="text-lg font-extrabold dark:text-white mb-3">История операций</h3>
                    {transactions.length === 0 ? (
                        <div className="text-center py-14 bg-white dark:bg-darkCard rounded-[1.75rem] border border-gray-100 dark:border-darkBorder">
                            <Icons.Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                            <p className="text-gray-400 dark:text-gray-600 text-sm font-medium">Операций пока нет</p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-darkCard rounded-[1.75rem] border border-gray-100 dark:border-darkBorder shadow-sm divide-y divide-gray-50 dark:divide-gray-800">
                            {transactions.map(tx => {
                                const { icon: TxIcon, cls } = txIcon(tx.type);
                                return (
                                    <div key={tx.id} className="flex items-center gap-3 p-4">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cls}`}><TxIcon className="w-4 h-4" /></div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-sm dark:text-white truncate">{tx.description}</p>
                                            <p className="text-xs text-gray-400">{formatDate(tx.timestamp)}</p>
                                        </div>
                                        <span className={`font-bold text-sm flex-shrink-0 ${tx.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>{tx.amount >= 0 ? '+' : ''}{formatMoney(tx.amount)} ₽</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {showTopUp && (
                <WalletTopUpModal state={state} updateState={updateState} onClose={() => setShowTopUp(false)} onSuccess={() => setShowTopUp(false)} />
            )}
            {showWithdraw && (
                <WalletWithdrawModal state={state} updateState={updateState} onClose={() => setShowWithdraw(false)} onSuccess={() => setShowWithdraw(false)} />
            )}
        </div>
    );
}
