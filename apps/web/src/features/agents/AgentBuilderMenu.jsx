import { useState } from 'react';
import { OrchestratorPurchaseModal } from '@/features/agents/OrchestratorPurchaseModal';
import { getOrchestratorLimit } from '@/shared/config/orchestrator';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОНСТРУКТОР AI-АГЕНТОВ — шторка "История агентов"
// ==========================================
export function AgentBuilderMenu({ open, onClose, agents, activeAgentId, onSelectAgent, onNewAgent, onDeleteAgent, onRenameAgent, updateState, state }) {
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    // Вкладка: обычные агенты или оркестраторы (покупаются отдельно)
    const [tab, setTab] = useState('workers');
    const [showPurchase, setShowPurchase] = useState(false);

    const plan = state?.userPlan || 'free';
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const workers = agents.filter(a => a.kind !== 'orchestrator');
    const orchLimit = getOrchestratorLimit(plan);

    const displayed = tab === 'orchestrators' ? orchestrators : workers;
    const sorted = [...displayed].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const formatDate = (ts) => new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    return (
        <>
            <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}></div>
            <div className={`fixed top-0 right-0 h-full w-[85vw] max-w-sm bg-white dark:bg-darkCard z-50 shadow-2xl transition-transform duration-300 flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-darkBorder flex-shrink-0">
                    <h3 className="text-lg font-extrabold dark:text-white">Меню агента</h3>
                    <button onClick={onClose} className="void-tap-target p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>
                </div>

                {/* Вкладки: обычные агенты / оркестраторы */}
                <div className="flex gap-1 px-5 pt-4 flex-shrink-0">
                    <button onClick={() => setTab('workers')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'workers' ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>Агенты</button>
                    <button onClick={() => setTab('orchestrators')} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'orchestrators' ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>Оркестраторы</button>
                </div>

                <div className="p-5 flex-shrink-0">
                    {tab === 'workers' ? (
                        <button onClick={onNewAgent} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors shadow-md">
                            <Icons.Plus /> Новый агент
                        </button>
                    ) : (
                        <div>
                            <button onClick={() => setShowPurchase(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors shadow-md">
                                <Icons.Plus /> Купить оркестратора
                            </button>
                            <p className="text-[11px] text-gray-400 mt-2 ml-1">Готов к работе сразу · раздаёт задачи агентам · {orchestrators.length}/{orchLimit} на тарифе «{plan}»</p>
                        </div>
                    )}
                </div>

                <div className="px-5 flex-1 overflow-y-auto pb-6">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">История агентов</h4>
                    {sorted.length === 0 ? (
                        <div className="text-center py-14">
                            <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                            <p className="text-gray-400 dark:text-gray-600 text-sm font-medium">Пока нет сохранённых агентов</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sorted.map(agent => (
                                <div key={agent.id} className={`group p-3 rounded-2xl border transition-colors ${activeAgentId === agent.id ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/30' : 'bg-gray-50 dark:bg-gray-800/40 border-transparent hover:border-gray-200 dark:hover:border-gray-700'}`}>
                                    {renamingId === agent.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                autoFocus
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { onRenameAgent(agent.id, renameValue.trim() || agent.name); setRenamingId(null); } if (e.key === 'Escape') setRenamingId(null); }}
                                                className="flex-1 min-w-0 p-2 bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder rounded-lg text-sm font-bold dark:text-white focus:outline-none focus:border-[#5b32d4]"
                                            />
                                            <button onClick={() => { onRenameAgent(agent.id, renameValue.trim() || agent.name); setRenamingId(null); }} className="void-tap-target p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg flex-shrink-0"><Icons.Check className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => agent.kind === 'orchestrator' ? updateState({ activeAgentId: agent.id, currentView: 'orchestrator-chat' }) : onSelectAgent(agent)} className="flex-1 min-w-0 text-left">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-bold text-sm truncate text-gray-900 dark:text-white">{agent.name}</p>
                                                    {!agent.isPaid && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex-shrink-0">Не оплачен</span>}
                                                    {agent.isPaid && agent.status === 'suspended' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-500 flex-shrink-0">Приостановлен</span>}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">{agent.kind === 'orchestrator' ? (agent.orchestration?.email || 'оркестратор') : `${agent.nodes.length} блок${agent.nodes.length === 1 ? '' : agent.nodes.length < 5 ? 'а' : 'ов'}`} · {formatDate(agent.updatedAt)}</p>
                                            </button>
                                            <button onClick={() => { setRenamingId(agent.id); setRenameValue(agent.name); }} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-[#5b32d4] hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors" title="Переименовать"><Icons.Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => { if (window.confirm(`Удалить агента «${agent.name}»?`)) onDeleteAgent(agent.id); }} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors" title="Удалить"><Icons.Trash className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-darkBorder flex-shrink-0">
                    <button onClick={() => updateState({ currentView: 'settings' })} className="void-tap-target w-11 h-11 flex items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors" title="Настройки">
                        <Icons.Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {showPurchase && (
                <OrchestratorPurchaseModal
                    state={state}
                    updateState={updateState}
                    onClose={() => setShowPurchase(false)}
                />
            )}
        </>
    );
}
