import { useState, useEffect, useCallback } from 'react';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { WalletWithdrawModal } from '@/features/wallet/WalletWithdrawModal';
import { LOW_BALANCE_THRESHOLD } from '@/shared/config/agents';
import { fetchWallet } from '@/shared/api/billing';
import { formatMoney } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


// #6: «Биллинг» — единый экран баланса (в настройках и в разделе «Агенты»
// это одно и то же). Баланс и история операций РЕАЛЬНЫЕ — берутся с сервера
// (walletKopecks + WalletTransaction), а не из локального состояния.
export function WalletView({ state, updateState, embedded = false }) {
    const [showTopUp, setShowTopUp] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [balance, setBalance] = useState((state.walletBalance || 0));
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const w = await fetchWallet();
            const rub = Math.round((w.balanceKopecks || 0) / 100);
            setBalance(rub);
            setTransactions((w.transactions || []).map(tx => ({
                id: tx.id,
                type: tx.type,
                amount: Math.round((tx.amountKopecks || 0) / 100),
                description: tx.description,
                timestamp: new Date(tx.createdAt).getTime(),
                status: tx.meta?.status || null,
            })));
            // Держим локальный баланс в синхроне (для бейджа в настройках и лимитов).
            updateState({ walletBalance: rub });
        } catch { /* сеть/не готово — покажем локальный баланс */ }
        setLoading(false);
    }, [updateState]);

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const formatDate = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    const txIcon = (type) => {
        if (type === 'TOPUP') return { icon: Icons.Wallet, cls: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' };
        if (type === 'WITHDRAW') return { icon: Icons.ArrowUp, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' };
        if (type === 'AGENT_FEE') return { icon: Icons.Robot, cls: 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400' };
        if (type === 'SUBSCRIPTION') return { icon: Icons.Sparkles, cls: 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400' };
        if (type === 'TOKEN_CHARGE') return { icon: Icons.Sparkles, cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' };
        return { icon: Icons.Receipt, cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500' };
    };

    return (
        <div className={`flex-1 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full ${embedded ? '' : 'overflow-y-auto pb-12'}`}>
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    {!embedded && <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>}
                    <h2 className="text-3xl font-extrabold dark:text-white">Биллинг</h2>
                </div>

                <div className="bg-gradient-to-br from-[#5b32d4] to-[#3d1f96] rounded-[2rem] p-6 shadow-lg mb-6 text-white relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10"></div>
                    <div className="absolute -right-2 -bottom-10 w-24 h-24 rounded-full bg-white/10"></div>
                    <p className="text-sm font-semibold text-white/70 mb-1.5 relative">Баланс</p>
                    <p className="text-4xl font-extrabold mb-5 relative">{formatMoney(balance)} ₽</p>
                    <div className="flex gap-2.5 relative">
                        <button onClick={() => setShowTopUp(true)} className="flex items-center gap-2 bg-white text-[#5b32d4] font-bold px-5 py-3 rounded-2xl hover:bg-white/90 active:scale-[0.97] transition-all shadow-md">
                            <Icons.Plus className="w-[18px] h-[18px]" /> Пополнить
                        </button>
                        <button onClick={() => setShowWithdraw(true)} disabled={balance <= 0} className="flex items-center gap-2 bg-white/15 text-white font-bold px-5 py-3 rounded-2xl hover:bg-white/25 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 transition-all border border-white/20">
                            <Icons.ArrowUp className="w-[18px] h-[18px]" /> Вывести
                        </button>
                    </div>
                </div>

                {balance < LOW_BALANCE_THRESHOLD && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 flex gap-3 items-start mb-6">
                        <Icons.Alert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" style={{width:'20px',height:'20px',minWidth:'20px'}} />
                        <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold leading-relaxed flex-1 min-w-0">Низкий баланс. Активным агентам может не хватить средств на оплату токенов — их работа автоматически приостановится до пополнения.</p>
                    </div>
                )}

                <div>
                    <h3 className="text-lg font-extrabold dark:text-white mb-3">История операций</h3>
                    {loading && transactions.length === 0 ? (
                        <div className="text-center py-14 bg-white dark:bg-darkCard rounded-[1.75rem] border border-gray-100 dark:border-darkBorder">
                            <Icons.Spinner className="w-6 h-6 mx-auto animate-spin text-gray-300" />
                        </div>
                    ) : transactions.length === 0 ? (
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
                                            <p className="text-xs text-gray-400">{formatDate(tx.timestamp)}{tx.status === 'processing' ? ' · в обработке' : ''}</p>
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
                <WalletTopUpModal onClose={() => setShowTopUp(false)} />
            )}
            {showWithdraw && (
                <WalletWithdrawModal balance={balance} onClose={() => setShowWithdraw(false)} onSuccess={() => { setShowWithdraw(false); load(); }} />
            )}
        </div>
    );
}
