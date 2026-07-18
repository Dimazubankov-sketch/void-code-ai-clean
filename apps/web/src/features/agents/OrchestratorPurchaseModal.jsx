import { useState } from 'react';
import { WalletTopUpModal } from '@/features/wallet/WalletTopUpModal';
import { createAgentConfig, generateOrchestratorEmail, getOrchestratorLimit, ORCHESTRATOR_BUILD_FEE } from '@/shared/config/orchestrator';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ПОКУПКА ОРКЕСТРАТОРА
// ==========================================
// Оркестратора не собирают по блокам — его покупают. Под каждый тариф своё
// ограничение на количество оркестраторов (Free 3 / Plus 5 / Pro 10 / Ultra 15).
// Оплата разовая, с баланса кошелька. После оплаты создаётся оркестратор с
// уникальной почтой @voidops.ai и сразу открывается его чат.
export function OrchestratorPurchaseModal({ state, updateState, onClose }) {
    const [showTopUp, setShowTopUp] = useState(false);

    const balance = state.walletBalance || 0;
    const plan = state.userPlan || 'free';
    const agents = state.aiAgents || [];
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const limit = getOrchestratorLimit(plan);
    const atLimit = orchestrators.length >= limit;
    const sufficient = balance >= ORCHESTRATOR_BUILD_FEE;

    const buy = () => {
        if (atLimit) return;
        if (!sufficient) { setShowTopUp(true); return; }

        const now = Date.now();
        const existingEmails = orchestrators.map(o => o.orchestration?.email).filter(Boolean);
        const email = generateOrchestratorEmail(existingEmails);
        const id = `orch_${now}`;
        const orchestrator = {
            id,
            name: `Оркестратор ${orchestrators.length + 1}`,
            kind: 'orchestrator',
            status: 'active',
            nodes: [], edges: [],
            isPaid: true,
            paidAt: now,
            orchestration: { email, subordinateIds: [], soundEnabled: true },
            config: createAgentConfig({ id, kind: 'orchestrator', email }),
            createdAt: now, updatedAt: now,
        };
        updateState({
            walletBalance: balance - ORCHESTRATOR_BUILD_FEE,
            walletTransactions: [
                { id: 'tx' + now, type: 'agent_fee', amount: -ORCHESTRATOR_BUILD_FEE, description: `Покупка оркестратора «${orchestrator.name}»`, timestamp: now },
                ...(state.walletTransactions || []),
            ],
            aiAgents: [...agents, orchestrator],
            activeAgentId: id,
            currentView: 'orchestrator-chat',
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full max-w-md rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-darkBorder relative my-6 sm:my-0" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors"><Icons.X /></button>

                <div className="w-14 h-14 bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 rounded-2xl flex items-center justify-center mb-4"><Icons.RobotArmy className="w-7 h-7" /></div>
                <h2 className="text-xl font-extrabold dark:text-white mb-1">Купить оркестратора</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Оркестратор — агент-дирижёр: раздаёт задачи другим агентам и координирует их работу. Собирать по блокам не нужно — он готов к работе сразу после покупки.</p>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Оркестраторов на тарифе «{plan}»</span><span className={`font-bold ${atLimit ? 'text-red-500' : 'dark:text-white'}`}>{orchestrators.length} / {limit}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Разовая стоимость</span><span className="font-bold dark:text-white">{formatMoney(ORCHESTRATOR_BUILD_FEE)} ₽</span></div>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl mb-5">
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">Баланс кошелька</span>
                    <span className={`font-bold text-sm ${sufficient ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{formatMoney(balance)} ₽</span>
                </div>

                {atLimit ? (
                    <>
                        <div className="text-sm text-red-500 font-semibold text-center mb-3">Достигнут лимит оркестраторов для тарифа «{plan}». Повысьте тариф, чтобы купить больше.</div>
                        <button onClick={() => { onClose(); updateState({ currentView: 'pricing' }); }} className="w-full py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors">Посмотреть тарифы</button>
                    </>
                ) : (
                    <button onClick={buy} className="w-full py-4 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-2xl shadow-lg transition-colors">
                        {sufficient ? `Купить за ${formatMoney(ORCHESTRATOR_BUILD_FEE)} ₽` : 'Пополнить и купить'}
                    </button>
                )}
            </div>

            {showTopUp && (
                <WalletTopUpModal
                    state={state}
                    updateState={updateState}
                    reason={`Пополните баланс минимум на ${formatMoney(Math.max(100, ORCHESTRATOR_BUILD_FEE - balance))} ₽, чтобы купить оркестратора.`}
                    onClose={() => setShowTopUp(false)}
                />
            )}
        </div>
    );
}
