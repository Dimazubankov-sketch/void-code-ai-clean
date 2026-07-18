import { useState } from 'react';
import { AgentActionSheet } from '@/features/cockpit/AgentActionSheet';
import { getAgentStatus, getOrchestratorLimit, resolveCockpitStatus } from '@/shared/config/orchestrator';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// COCKPIT — Панель управления агентами (Dashboard)
// ==========================================
// Два интерактивных списка (обычные агенты и оркестраторы), поиск по названию
// вверху, визуальные индикаторы статуса. Клик по агенту открывает мини-панель
// быстрых действий (AgentActionSheet).

function StatusDot({ statusId }) {
    const s = getAgentStatus(statusId);
    return (
        <span className="relative flex items-center justify-center w-2.5 h-2.5">
            {s.pulse && (
                <span
                    className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
                    style={{ backgroundColor: s.color }}
                />
            )}
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
        </span>
    );
}

function AgentRow({ agent, onClick }) {
    const displayStatus = resolveCockpitStatus(agent);
    const s = getAgentStatus(displayStatus);
    const isOrch = agent.kind === 'orchestrator';
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
        >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                isOrch ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
                <Icons.Robot className={`w-5 h-5 ${isOrch ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="font-bold text-sm dark:text-white truncate">{agent.name}</p>
                    {isOrch && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#5b32d4] text-white shrink-0">
                            ОРКЕСТРАТОР
                        </span>
                    )}
                </div>
                {isOrch && agent.orchestration?.email && (
                    <p className="text-[11px] text-gray-400 truncate">{agent.orchestration.email}</p>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {!isOrch && agent.isPaid === false && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">Не оплачен</span>
                )}
                <StatusDot statusId={displayStatus} />
                <span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.label}</span>
            </div>
        </button>
    );
}

function MetricCard({ label, value, onClick, highlight, color, pulse }) {
    return (
        <button
            onClick={onClick}
            className={`relative flex flex-col items-center justify-center py-3 px-1 rounded-2xl border transition-all ${highlight ? 'bg-white dark:bg-darkCard border-[#5b32d4] shadow-md scale-[1.03]' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder hover:border-gray-200 dark:hover:border-gray-700'}`}
        >
            <span className="text-2xl font-extrabold leading-none" style={{ color }}>{value}</span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-400 mt-1 text-center leading-tight">{label}</span>
            {pulse && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-ping" />}
            {pulse && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" />}
        </button>
    );
}

export function CockpitView({ state, updateState }) {
    const [query, setQuery] = useState('');
    const [selectedAgentId, setSelectedAgentId] = useState(null);
    const [statusFilter, setStatusFilter] = useState(null); // null | 'active' | 'working' | 'sleeping'

    const allAgents = state.aiAgents || [];
    const plan = state.userPlan || 'free';
    const orchLimit = getOrchestratorLimit(plan);

    // Метрики для панели «приборов» сверху
    const pendingReports = Object.values(state.orchestratorReports || {}).reduce((n, l) => n + l.filter(r => r.status === 'pending').length, 0);
    const metrics = {
        total: allAgents.length,
        active: allAgents.filter(a => resolveCockpitStatus(a) === 'active').length,
        working: allAgents.filter(a => resolveCockpitStatus(a) === 'working').length,
        sleeping: allAgents.filter(a => resolveCockpitStatus(a) === 'sleeping').length,
        orchestrators: allAgents.filter(a => a.kind === 'orchestrator').length,
        pending: pendingReports,
    };

    const match = (a) => a.name?.toLowerCase().includes(query.trim().toLowerCase());
    const passesFilter = (a) => !statusFilter || resolveCockpitStatus(a) === statusFilter;
    const workers = allAgents.filter((a) => a.kind !== 'orchestrator' && match(a) && passesFilter(a));
    const orchestrators = allAgents.filter((a) => a.kind === 'orchestrator' && match(a) && passesFilter(a));

    const selectedAgent = allAgents.find((a) => a.id === selectedAgentId) || null;

    // Клик по агенту: оркестратор → сразу его чат; обычный агент → мини-панель
    const handleAgentClick = (agent) => {
        if (agent.kind === 'orchestrator') {
            updateState({ activeAgentId: agent.id, currentView: 'orchestrator-chat' });
        } else {
            setSelectedAgentId(agent.id);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                {/* Заголовок */}
                <div className="flex items-center mb-6 gap-4">
                    <button onClick={() => updateState({ currentView: 'home', viewHistory: [] })} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <Icons.ChevronLeft />
                    </button>
                    <div>
                        <h2 className="text-3xl font-extrabold dark:text-white">Cockpit</h2>
                        <p className="text-sm text-gray-400">Панель управления агентами</p>
                    </div>
                </div>

                {/* Панель метрик — «приборная доска» Cockpit */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 mb-5">
                    <MetricCard label="Всего" value={metrics.total} active={statusFilter === null && true} onClick={() => setStatusFilter(null)} highlight={statusFilter === null} color="#5b32d4" />
                    <MetricCard label="Активны" value={metrics.active} onClick={() => setStatusFilter(statusFilter === 'active' ? null : 'active')} highlight={statusFilter === 'active'} color="#22c55e" />
                    <MetricCard label="В задаче" value={metrics.working} onClick={() => setStatusFilter(statusFilter === 'working' ? null : 'working')} highlight={statusFilter === 'working'} color="#f59e0b" />
                    <MetricCard label="Спят" value={metrics.sleeping} onClick={() => setStatusFilter(statusFilter === 'sleeping' ? null : 'sleeping')} highlight={statusFilter === 'sleeping'} color="#94a3b8" />
                    <MetricCard label="Ждут вас" value={metrics.pending} onClick={() => updateState({ showNotifications: true })} color="#e11d48" pulse={metrics.pending > 0} />
                </div>

                {/* Поиск */}
                <div className="relative mb-6">
                    <Icons.Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск по названию…"
                        className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors"
                    />
                </div>

                {/* Оркестраторы */}
                <div className="mb-8">
                    <div className="flex items-center justify-between px-1 mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Оркестраторы</h3>
                        <span className="text-[11px] font-semibold text-gray-400">
                            {orchestrators.length} / {orchLimit}
                        </span>
                    </div>
                    <div className="bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-darkBorder p-1.5">
                        {orchestrators.length ? (
                            orchestrators.map((a) => <AgentRow key={a.id} agent={a} onClick={() => handleAgentClick(a)} />)
                        ) : (
                            <p className="text-sm text-gray-400 text-center py-6 px-4">
                                Оркестраторов пока нет. Соберите первого в конструкторе агентов.
                            </p>
                        )}
                    </div>
                </div>

                {/* Обычные агенты */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 px-1 mb-2">Агенты</h3>
                    <div className="bg-white dark:bg-darkCard rounded-3xl border border-gray-100 dark:border-darkBorder p-1.5">
                        {workers.length ? (
                            workers.map((a) => <AgentRow key={a.id} agent={a} onClick={() => handleAgentClick(a)} />)
                        ) : (
                            <p className="text-sm text-gray-400 text-center py-6 px-4">
                                {query ? 'Ничего не найдено' : 'Агентов пока нет.'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Мини-панель действий */}
            {selectedAgent && (
                <AgentActionSheet
                    agent={selectedAgent}
                    state={state}
                    updateState={updateState}
                    onClose={() => setSelectedAgentId(null)}
                />
            )}
        </div>
    );
}
