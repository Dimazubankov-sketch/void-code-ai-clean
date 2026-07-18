import { useState } from 'react';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { AGENT_BUILD_FEE } from '@/shared/config/agents';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// СЧЁТ ЗА СБОРКУ АГЕНТА
// ==========================================
// Показывается сразу после того, как агент собран (неважно, через блоки
// или через чат) — агент сохраняется как неоплаченный черновик и не
// может использоваться/тестироваться, пока счёт не будет оплачен с баланса.
export function AgentInvoiceModal({ state, updateState, agent, onClose, onPaid }) {
    const [showTopUp, setShowTopUp] = useState(false);
    const balance = state.walletBalance || 0;
    const sufficient = balance >= AGENT_BUILD_FEE;

    const handlePay = () => {
        if (!sufficient) { setShowTopUp(true); return; }
        const now = Date.now();
        updateState({
            walletBalance: balance - AGENT_BUILD_FEE,
            walletTransactions: [{ id: 'tx' + now, type: 'agent_fee', amount: -AGENT_BUILD_FEE, description: `Сборка агента «${agent.name}»`, timestamp: now }, ...(state.walletTransactions || [])],
            aiAgents: (state.aiAgents || []).map(a => a.id === agent.id ? { ...a, isPaid: true, status: 'active', paidAt: now } : a)
        });
        onPaid && onPaid();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto fade-in">
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative my-6 sm:my-0">
                <div className="w-14 h-14 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4"><Icons.Receipt className="w-7 h-7" /></div>
                <h2 className="text-xl font-extrabold dark:text-white mb-1">Счёт за сборку агента</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Агент «{agent.name}» собран и сохранён как черновик. Чтобы забрать его и запустить в работу, оплатите разовую услугу сборки.</p>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Сборка агента «{agent.name}»</span><span className="font-bold dark:text-white">{formatMoney(AGENT_BUILD_FEE)} ₽</span></div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between"><span className="font-bold dark:text-white">Итого</span><span className="font-extrabold text-[#5b32d4] dark:text-purple-400">{formatMoney(AGENT_BUILD_FEE)} ₽</span></div>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl mb-5">
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Баланс кошелька</span>
                    <span className={`font-bold text-sm ${sufficient ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{formatMoney(balance)} ₽</span>
                </div>

                <button onClick={handlePay} className="w-full py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors mb-2.5">
                    {sufficient ? `Оплатить со счёта ${formatMoney(AGENT_BUILD_FEE)} ₽` : 'Пополнить и оплатить'}
                </button>
                <button onClick={onClose} className="w-full py-3.5 text-gray-500 dark:text-gray-400 font-bold text-sm hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                    Оплатить позже (агент останется черновиком)
                </button>
            </div>

            {showTopUp && (
                <WalletTopUpModal
                    state={state}
                    updateState={updateState}
                    reason={`Пополните баланс минимум на ${formatMoney(Math.max(100, AGENT_BUILD_FEE - balance))} ₽, чтобы оплатить сборку агента.`}
                    onClose={() => setShowTopUp(false)}
                    onSuccess={() => setShowTopUp(false)}
                />
            )}
        </div>
    );
}
