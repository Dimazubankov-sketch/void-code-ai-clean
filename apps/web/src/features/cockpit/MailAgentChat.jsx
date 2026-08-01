import { useState } from 'react';
import { OrchestratorMessages } from '@/features/cockpit/OrchestratorMessages';
import { useOrchestratorThread } from '@/features/cockpit/useOrchestratorThread';
import { ChatInputBar } from '@/features/chat/ChatInputBar';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// MailAgentChat — «Оповещения агентов» внутри почты
// ==========================================
// Это ТОТ ЖЕ чат оркестратора, что и «кабина» из Cockpit — один контекст,
// одна история (state.orchestratorThreads/orchestratorReports через
// useOrchestratorThread), просто встроенный прямо в панель почты вместо
// всплывающего окна. Никакой отдельной логики ответов здесь больше нет —
// единая система для обоих мест входа.

function OrchestratorChatInline({ state, updateState, orchestrator, onBack }) {
    const [input, setInput] = useState('');
    const { thread, reports, sendTask, respond } = useOrchestratorThread(state, updateState, orchestrator);
    const handleSend = () => { sendTask(input); setInput(''); };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 dark:border-darkBorder shrink-0">
                <button onClick={onBack} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#312a6b] to-[#a52fe0] text-white flex items-center justify-center shrink-0"><Icons.Robot className="w-5 h-5" /></div>
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm dark:text-white truncate">{orchestrator.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{orchestrator.orchestration?.email || 'дирижёр агентов'}</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                <OrchestratorMessages
                    thread={thread}
                    reports={reports}
                    onRespond={respond}
                    emptyHint="Отчётов пока нет. Поставьте задачу оркестратору ниже."
                />
            </div>

            <div className="p-2.5 border-t border-gray-100 dark:border-darkBorder shrink-0">
                <ChatInputBar
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    lang={state.lang || 'ru'}
                    voiceLang={state.voiceLang || 'ru-RU'}
                    placeholder="Дать задачу оркестратору…"
                />
            </div>
        </div>
    );
}

export function MailAgentChat({ state, updateState }) {
    const agents = state.aiAgents || [];
    const orchestrators = agents.filter(a => a.kind === 'orchestrator');
    const [openId, setOpenId] = useState(null);
    const orchestrator = orchestrators.find(o => o.id === openId);

    // Включить/выключить звук уведомлений оркестратора
    const toggleSound = (o) => {
        updateState({
            aiAgents: agents.map(a => a.id === o.id
                ? { ...a, orchestration: { ...(a.orchestration || {}), soundEnabled: !(a.orchestration?.soundEnabled !== false) } }
                : a),
        });
    };

    if (orchestrator) {
        return <OrchestratorChatInline state={state} updateState={updateState} orchestrator={orchestrator} onBack={() => setOpenId(null)} />;
    }

    if (orchestrators.length === 0) {
        return (
            <div className="text-center text-gray-400 py-16 px-6">
                <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium mb-1">Оркестраторов пока нет</p>
                <p className="text-xs">Купите оркестратора в магазине, и здесь появится чат с ним</p>
            </div>
        );
    }

    return (
        <div className="p-3 space-y-2">
            {orchestrators.map(o => {
                const soundOn = o.orchestration?.soundEnabled !== false;
                return (
                    <div key={o.id} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-[#efe9fb] to-[#f3ecfb] dark:from-purple-900/20 dark:to-indigo-900/20 hover:shadow-sm transition-all">
                        <button onClick={() => setOpenId(o.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#312a6b] to-[#a52fe0] text-white flex items-center justify-center shrink-0"><Icons.Robot className="w-5 h-5" /></div>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm dark:text-white truncate">{o.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">Оркестратор · {o.orchestration?.email || 'дирижёр агентов'}</p>
                            </div>
                        </button>
                        {/* Выключение звука уведомлений этого оркестратора */}
                        <button onClick={() => toggleSound(o)} title={soundOn ? 'Выключить звук' : 'Включить звук'} className={`p-2 rounded-lg shrink-0 transition-colors ${soundOn ? 'text-[#5b32d4] hover:bg-white/60 dark:hover:bg-gray-800' : 'text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800'}`}>
                            {soundOn ? <Icons.Volume2 className="w-5 h-5" /> : <Icons.VolumeX className="w-5 h-5" />}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
