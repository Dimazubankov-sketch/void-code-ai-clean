import { useState } from 'react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ПРИВЯЗКА ПОДЧИНЁННЫХ АГЕНТОВ К ОРКЕСТРАТОРУ
// ==========================================
// Слева — оркестратор, справа — список агентов. По умолчанию показываются
// НЕпривязанные агенты; переключатель «Все агенты» показывает вообще всех.
// Поиск по имени выводит именно искомого агента. Агент, уже привязанный к
// ДРУГОМУ оркестратору, показывается тусклым с пометкой «привязан к [имя]».

export function SubordinateLinkMenu({ orchestrator, state, updateState, onClose }) {
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    const allAgents = state.aiAgents || [];
    const workers = allAgents.filter((a) => a.kind !== 'orchestrator');
    const orchestrators = allAgents.filter((a) => a.kind === 'orchestrator');
    const linkedIds = orchestrator.orchestration?.subordinateIds || [];

    // Для каждого агента находим, к какому оркестратору он привязан (если есть)
    const ownerOf = (agentId) =>
        orchestrators.find((o) => (o.orchestration?.subordinateIds || []).includes(agentId));

    const match = (a) => a.name?.toLowerCase().includes(query.trim().toLowerCase());

    // Что показываем: при поиске — всех подходящих; иначе зависит от showAll
    const visible = workers.filter((a) => {
        if (query.trim()) return match(a);
        if (showAll) return true;
        // По умолчанию — только свободные (ни к кому не привязанные)
        return !ownerOf(a.id);
    });

    const toggleLink = (agent) => {
        const owner = ownerOf(agent.id);
        const isMine = linkedIds.includes(agent.id);

        let agents = allAgents;
        if (isMine) {
            // Отвязать от текущего оркестратора
            agents = agents.map((a) =>
                a.id === orchestrator.id
                    ? { ...a, orchestration: { ...a.orchestration, subordinateIds: linkedIds.filter((id) => id !== agent.id) }, updatedAt: Date.now() }
                    : a,
            );
        } else {
            // Привязать к текущему. Если агент был у другого оркестратора —
            // сначала отвязываем оттуда (агент подчиняется одному дирижёру).
            agents = agents.map((a) => {
                if (owner && a.id === owner.id) {
                    return { ...a, orchestration: { ...a.orchestration, subordinateIds: (a.orchestration?.subordinateIds || []).filter((id) => id !== agent.id) } };
                }
                if (a.id === orchestrator.id) {
                    return { ...a, orchestration: { ...a.orchestration, subordinateIds: [...linkedIds, agent.id] }, updatedAt: Date.now() };
                }
                return a;
            });
        }
        updateState({ aiAgents: agents });
    };

    return (
        <div className="fixed inset-0 z-[95] flex bg-black/40 backdrop-blur-sm fade-in" onClick={onClose}>
            <div
                className="ml-auto w-full max-w-3xl h-full bg-white dark:bg-darkCard shadow-2xl flex slide-in-right"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ЛЕВАЯ ПАНЕЛЬ — оркестратор */}
                <div className="hidden sm:flex flex-col w-56 border-r border-gray-100 dark:border-darkBorder p-5 shrink-0 bg-gray-50/50 dark:bg-gray-900/20">
                    <div className="w-14 h-14 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 flex items-center justify-center mb-3">
                        <Icons.Robot className="w-7 h-7 text-[#5b32d4]" />
                    </div>
                    <p className="font-extrabold dark:text-white leading-tight">{orchestrator.name}</p>
                    <p className="text-[11px] text-gray-400 mt-1 break-all">{orchestrator.orchestration?.email}</p>
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-darkBorder">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Подчинённых</p>
                        <p className="text-3xl font-extrabold text-[#5b32d4] mt-1">{linkedIds.length}</p>
                    </div>
                </div>

                {/* ПРАВАЯ ПАНЕЛЬ — список агентов */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-darkBorder">
                        <h3 className="font-extrabold text-lg dark:text-white">Привязка агентов</h3>
                        <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                    </div>

                    {/* Поиск + переключатель «Все агенты» */}
                    <div className="px-5 py-3 space-y-3 border-b border-gray-100 dark:border-darkBorder">
                        <div className="relative">
                            <Icons.Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Поиск агента по имени…"
                                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]"
                            />
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setShowAll(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${!showAll ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4]' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Свободные</button>
                            <button onClick={() => setShowAll(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${showAll ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4]' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>Все агенты</button>
                        </div>
                    </div>

                    {/* Список */}
                    <div className="flex-1 overflow-y-auto p-3">
                        {visible.length === 0 ? (
                            <div className="text-center text-gray-400 py-16">
                                <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p className="text-sm">{query ? 'Агент не найден' : 'Свободных агентов нет'}</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {visible.map((agent) => {
                                    const owner = ownerOf(agent.id);
                                    const isMine = linkedIds.includes(agent.id);
                                    const linkedElsewhere = owner && owner.id !== orchestrator.id;
                                    return (
                                        <div
                                            key={agent.id}
                                            className={`flex items-center gap-3 px-3 py-3 rounded-2xl border transition-colors ${
                                                isMine
                                                    ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/30'
                                                    : 'bg-gray-50 dark:bg-gray-800/40 border-transparent'
                                            } ${linkedElsewhere ? 'opacity-50' : ''}`}
                                        >
                                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shrink-0">
                                                <Icons.Robot className="w-4 h-4 text-gray-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm dark:text-white truncate">{agent.name}</p>
                                                {linkedElsewhere && (
                                                    <p className="text-[11px] text-gray-400 truncate">привязан к «{owner.name}»</p>
                                                )}
                                                {isMine && <p className="text-[11px] text-[#5b32d4] font-semibold">ваш подчинённый</p>}
                                            </div>
                                            <button
                                                onClick={() => toggleLink(agent)}
                                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                    isMine
                                                        ? 'bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100'
                                                        : 'bg-[#5b32d4] text-white hover:bg-[#4a26b0]'
                                                }`}
                                            >
                                                {isMine ? 'Отвязать' : linkedElsewhere ? 'Переназначить' : 'Привязать'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
