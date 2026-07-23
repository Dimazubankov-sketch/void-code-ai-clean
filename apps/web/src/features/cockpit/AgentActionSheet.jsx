import { useState } from 'react';
import { AgentPromptEditor } from '@/features/cockpit/AgentPromptEditor';
import { getAgentStatus, resolveCockpitStatus } from '@/shared/config/orchestrator';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AgentActionSheet — мини-панель быстрых действий по агенту
// ==========================================
// Открывается при клике на агента в Cockpit. Действия:
//   • Остановка / Принудительный запуск (смена статуса)
//   • Редактирование (переход в конструктор или чат промпта)
//   • Переименование
//   • Настройка графика работы
//   • Правка логики текстовым промптом (AgentPromptEditor)

export function AgentActionSheet({ agent, state, updateState, onClose }) {
    const [mode, setMode] = useState('menu'); // menu | rename | schedule | prompt
    const [name, setName] = useState(agent.name);
    const [schedule, setSchedule] = useState(agent.schedule?.label || '');

    const displayStatus = resolveCockpitStatus(agent);
    const s = getAgentStatus(displayStatus);
    const isOrch = agent.kind === 'orchestrator';

    const patchAgent = (patch) => {
        const agents = (state.aiAgents || []).map((a) => (a.id === agent.id ? { ...a, ...patch } : a));
        updateState({ aiAgents: agents });
    };

    // Остановка / принудительный запуск. Для обычных агентов из конструктора
    // работает только если агент оплачен (иначе биллинг не позволит).
    const canRun = isOrch || agent.isPaid !== false;
    const toggleRun = () => {
        if (!canRun) { window.alert('Агент не оплачен. Оплатите его в конструкторе, чтобы запускать.'); return; }
        const next = displayStatus === 'sleeping' ? 'active' : 'sleeping';
        patchAgent({ status: next });
    };
    const forceRun = () => {
        if (!canRun) { window.alert('Агент не оплачен. Оплатите его в конструкторе, чтобы запускать.'); return; }
        patchAgent({ status: 'working' });
    };

    // Редактирование: оркестратор → чат с ним, обычный агент → конструктор
    const editAgent = () => {
        if (isOrch) {
            updateState({ currentView: 'orchestrator-chat', activeAgentId: agent.id });
        } else {
            updateState({ currentView: 'agent-builder', activeAgentId: agent.id });
        }
        onClose();
    };

    const saveName = () => {
        if (name.trim()) patchAgent({ name: name.trim() });
        setMode('menu');
    };

    const saveSchedule = () => {
        patchAgent({ schedule: schedule.trim() ? { label: schedule.trim() } : null });
        setMode('menu');
    };

    const Action = ({ icon: IconC, label, onClick, danger }) => (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors ${
                danger
                    ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 dark:text-white'
            }`}
        >
            <IconC className="w-5 h-5" />
            <span className="font-semibold text-sm">{label}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm fade-in" onClick={onClose}>
            <div
                className="w-full sm:max-w-md bg-white dark:bg-darkCard rounded-t-3xl sm:rounded-3xl shadow-2xl slide-in-right sm:animate-none max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {mode === 'menu' && (
                    <div className="p-3">
                        {/* Шапка агента */}
                        <div className="flex items-center gap-3 px-3 py-3 mb-1">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isOrch ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                <Icons.Robot className={`w-6 h-6 ${isOrch ? 'text-[#5b32d4]' : 'text-gray-500'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-extrabold dark:text-white truncate">{agent.name}</p>
                                <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                        </div>

                        <div className="h-px bg-gray-100 dark:bg-darkBorder my-1" />

                        <Action
                            icon={displayStatus === 'sleeping' ? Icons.Play : Icons.Pause}
                            label={displayStatus === 'sleeping' ? 'Запустить' : 'Остановить'}
                            onClick={toggleRun}
                        />
                        <Action icon={Icons.Play} label="Принудительный запуск" onClick={forceRun} />
                        <Action icon={Icons.Pencil} label="Редактировать логику" onClick={editAgent} />
                        <Action icon={Icons.Code} label="Правка через промпт" onClick={() => setMode('prompt')} />
                        <Action icon={Icons.Tag} label="Переименовать" onClick={() => setMode('rename')} />
                        <Action icon={Icons.Clock} label="График работы" onClick={() => setMode('schedule')} />
                    </div>
                )}

                {mode === 'rename' && (
                    <div className="p-5">
                        <h4 className="font-extrabold text-lg dark:text-white mb-4">Переименовать</h4>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] mb-4"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setMode('menu')} className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 font-bold text-sm dark:text-white">Отмена</button>
                            <button onClick={saveName} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4c28b8] text-white font-bold text-sm transition-colors">Сохранить</button>
                        </div>
                    </div>
                )}

                {mode === 'schedule' && (
                    <div className="p-5">
                        <h4 className="font-extrabold text-lg dark:text-white mb-1">График работы</h4>
                        <p className="text-sm text-gray-400 mb-4">Например: «каждый день в 09:00» или «по будням».</p>
                        <input
                            value={schedule}
                            onChange={(e) => setSchedule(e.target.value)}
                            placeholder="Расписание запуска"
                            className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] mb-4"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setMode('menu')} className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 font-bold text-sm dark:text-white">Отмена</button>
                            <button onClick={saveSchedule} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4c28b8] text-white font-bold text-sm transition-colors">Сохранить</button>
                        </div>
                    </div>
                )}

                {mode === 'prompt' && (
                    <AgentPromptEditor
                        agent={agent}
                        state={state}
                        updateState={updateState}
                        onClose={() => setMode('menu')}
                    />
                )}
            </div>
        </div>
    );
}
