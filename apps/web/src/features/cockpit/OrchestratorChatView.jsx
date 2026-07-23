import { useState, useRef, useEffect } from 'react';
import { SubordinateLinkMenu } from '@/features/cockpit/SubordinateLinkMenu';
import { buildExecutionPlan, formatPlanReport } from '@/shared/lib/orchestrator-engine';
import { useVoiceInput } from '@/shared/lib/useVoiceInput';
import { playNotificationSound } from '@/shared/lib/sound';
import { getAgentStatus, resolveCockpitStatus } from '@/shared/config/orchestrator';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// OrchestratorChatView — «кабина» управления оркестратором
// ==========================================
// Открывается поверх Cockpit как отдельное окно чата (мобильный формат, не на
// весь экран). Это «кабина самолёта»: вся приборная панель — сверху (инфо об
// оркестраторе, статус, счётчик подчинённых, привязка агентов, почта, пауза/
// запуск, статус-лента подчинённых), а снизу — сам чат с задачами и HITL.

export function OrchestratorChatView({ state, updateState }) {
    const orchestrator = (state.aiAgents || []).find((a) => a.id === state.activeAgentId && a.kind === 'orchestrator');
    const [input, setInput] = useState('');
    const voice = useVoiceInput((text) => setInput(prev => (prev ? prev + ' ' : '') + text));
    const [showLinkMenu, setShowLinkMenu] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const endRef = useRef(null);

    const thread = (state.orchestratorThreads || {})[orchestrator?.id] || [];

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [thread.length]);

    const close = () => {
        const hist = state.viewHistory || [];
        const trimmed = hist[hist.length - 1] === 'cockpit' ? hist.slice(0, -1) : hist;
        updateState({ currentView: 'cockpit', activeAgentId: null, viewHistory: trimmed });
    };

    if (!orchestrator) {
        return (
            <div className="flex-1 flex items-center justify-center h-full bg-[#f8f9fc] dark:bg-darkBg">
                <button onClick={close} className="text-[#5b32d4] font-bold">← В Cockpit</button>
            </div>
        );
    }

    const subordinates = (state.aiAgents || []).filter(
        (a) => a.kind !== 'orchestrator' && (orchestrator.orchestration?.subordinateIds || []).includes(a.id),
    );

    const orchStatus = getAgentStatus(resolveCockpitStatus(orchestrator));

    const pushThread = (orchestratorId, entries) => {
        const threads = { ...(state.orchestratorThreads || {}) };
        threads[orchestratorId] = [...(threads[orchestratorId] || []), ...entries];
        return threads;
    };
    const pushReport = (orchestratorId, report) => {
        const reports = { ...(state.orchestratorReports || {}) };
        reports[orchestratorId] = [...(reports[orchestratorId] || []), report];
        return reports;
    };

    const sendTask = () => {
        const text = input.trim();
        if (!text) return;
        const plan = buildExecutionPlan(orchestrator, text, subordinates);
        const reportBody = formatPlanReport(plan);
        const report = { id: plan.id, at: Date.now(), body: reportBody, status: 'pending', plan };
        const userMsg = { id: `u_${Date.now()}`, role: 'user', text, at: Date.now() };
        const orchMsg = { id: `o_${Date.now()}`, role: 'orchestrator', text: reportBody, at: Date.now(), reportId: plan.id, planStatus: 'pending' };
        updateState({
            orchestratorThreads: pushThread(orchestrator.id, [userMsg, orchMsg]),
            orchestratorReports: pushReport(orchestrator.id, report),
        });
        setInput('');
        if ((orchestrator.orchestration?.soundEnabled ?? true) && state.notificationsEnabled !== false) {
            playNotificationSound();
        }
    };

    const respond = (reportId, decision) => {
        updateState({ pendingHitl: { orchestratorId: orchestrator.id, reportId, decision } });
    };

    // Пауза / запуск оркестратора прямо из кабины
    const toggleRun = () => {
        const next = resolveCockpitStatus(orchestrator) === 'sleeping' ? 'active' : 'sleeping';
        updateState({ aiAgents: (state.aiAgents || []).map(a => a.id === orchestrator.id ? { ...a, status: next } : a) });
    };

    const soundOn = orchestrator.orchestration?.soundEnabled ?? true;
    const toggleSound = () => {
        updateState({ aiAgents: (state.aiAgents || []).map(a => a.id === orchestrator.id ? { ...a, orchestration: { ...a.orchestration, soundEnabled: !soundOn } } : a) });
    };

    // Переименование оркестратора — почта (email) остаётся неизменной
    const saveName = () => {
        const nm = nameDraft.trim();
        if (nm) updateState({ aiAgents: (state.aiAgents || []).map(a => a.id === orchestrator.id ? { ...a, name: nm, updatedAt: Date.now() } : a) });
        setRenaming(false);
    };

    return (
        <div className="fixed inset-x-0 top-0 h-app-screen z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm fade-in p-0 sm:p-4" onClick={close}>
            {/* Окно-«кабина»: мобильный формат, не на весь экран */}
            <div
                className="relative w-full h-full sm:h-[90vh] sm:max-h-[880px] sm:w-[430px] bg-[#f8f9fc] dark:bg-darkBg sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col slide-in-right"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ===== ПРИБОРНАЯ ПАНЕЛЬ (всё управление — сверху) ===== */}
                <div className="bg-white dark:bg-darkCard border-b border-gray-100 dark:border-darkBorder shrink-0">
                    {/* Ряд 1: идентификация + закрыть */}
                    <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                        <div className="relative w-11 h-11 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                            <Icons.Robot className="w-6 h-6 text-[#5b32d4] dark:text-purple-400" />
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-darkCard" style={{ backgroundColor: orchStatus.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                            {renaming ? (
                                <input
                                    value={nameDraft}
                                    onChange={(e) => setNameDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(false); }}
                                    onBlur={saveName}
                                    autoFocus
                                    className="w-full font-extrabold dark:text-white bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1 outline-none border border-[#5b32d4]"
                                />
                            ) : (
                                <button onClick={() => { setNameDraft(orchestrator.name); setRenaming(true); }} className="flex items-center gap-1.5 text-left group">
                                    <span className="font-extrabold dark:text-white truncate leading-tight">{orchestrator.name}</span>
                                    <Icons.Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                            )}
                            <p className="text-[11px] text-gray-400 truncate">{orchestrator.orchestration?.email}</p>
                        </div>
                        <button onClick={close} className="p-2 -mr-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.X /></button>
                    </div>

                    {/* Ряд 2: приборы-кнопки */}
                    <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
                        <CockpitBtn icon={Icons.RobotArmy} label={`Агенты ${subordinates.length}`} onClick={() => setShowLinkMenu(true)} accent />
                        <CockpitBtn icon={resolveCockpitStatus(orchestrator) === 'sleeping' ? Icons.Play : Icons.Pause} label={resolveCockpitStatus(orchestrator) === 'sleeping' ? 'Запуск' : 'Пауза'} onClick={toggleRun} />
                        <CockpitBtn icon={soundOn ? Icons.VolumeOn : Icons.VolumeOff} label={soundOn ? 'Звук' : 'Тихо'} onClick={toggleSound} />
                        <CockpitBtn icon={Icons.MailLogo} label="Почта" onClick={() => updateState({ showNotifications: true })} />
                    </div>

                    {/* Ряд 3: статус-лента подчинённых (мини-дэшборд) */}
                    {subordinates.length > 0 && (
                        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
                            {subordinates.map((s) => {
                                const st = getAgentStatus(resolveCockpitStatus(s));
                                return (
                                    <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 shrink-0">
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                                        <span className="text-[11px] font-semibold dark:text-gray-300 whitespace-nowrap">{s.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ===== ЛЕНТА ЧАТА ===== */}
                <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
                    {thread.length === 0 && (
                        <div className="text-center text-gray-400 py-12">
                            <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-sm">Поставьте задачу — оркестратор разложит её<br />на подзадачи и предложит план.</p>
                            {subordinates.length === 0 && (
                                <button onClick={() => setShowLinkMenu(true)} className="text-xs text-[#5b32d4] font-bold mt-3 underline underline-offset-2">Привязать агентов →</button>
                            )}
                        </div>
                    )}
                    {thread.map((m) => {
                        if (m.role === 'user') {
                            return (
                                <div key={m.id} className="flex justify-end">
                                    <div className="max-w-[80%] bg-[#5b32d4] text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">{m.text}</div>
                                </div>
                            );
                        }
                        const report = ((state.orchestratorReports || {})[orchestrator.id] || []).find((r) => r.id === m.reportId);
                        const status = report?.status || 'pending';
                        return (
                            <div key={m.id} className="flex justify-start">
                                <div className="max-w-[85%] bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl rounded-bl-md px-4 py-3 text-sm dark:text-gray-200">
                                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                                    {status === 'pending' && (
                                        <div className="flex gap-2 mt-3">
                                            <button onClick={() => respond(m.reportId, 'approved')} className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-colors">Разрешить</button>
                                            <button onClick={() => respond(m.reportId, 'edited')} className="flex-1 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs font-bold dark:text-white transition-colors">Правка</button>
                                            <button onClick={() => respond(m.reportId, 'rejected')} className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 text-red-500 text-xs font-bold transition-colors">Отказ</button>
                                        </div>
                                    )}
                                    {status === 'approved' && <p className="mt-2 text-[11px] font-bold text-green-600 dark:text-green-400">✓ Одобрено — задачи разданы</p>}
                                    {status === 'rejected' && <p className="mt-2 text-[11px] font-bold text-red-500">✕ Отклонено</p>}
                                    {status === 'edited' && <p className="mt-2 text-[11px] font-bold text-amber-500">✎ Отправлено на правку</p>}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={endRef} />
                </div>

                {/* ===== ВВОД ===== */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard pb-safe shrink-0">
                    {/* Индикация записи — отдельной строкой НАД полем ввода */}
                    {voice.listening && (
                        <div className="flex items-center gap-2.5 mb-2 px-3 py-2 rounded-xl bg-[#f3effd] dark:bg-purple-900/20 border border-[#e2d9fa] dark:border-purple-900/40 fade-in">
                            <span className="flex items-end gap-0.5 h-4 shrink-0">
                                <span className="voice-bar w-1 rounded-full bg-[#5b32d4]" style={{ animationDelay: '0ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#7b4fe0]" style={{ animationDelay: '150ms' }} />
                                <span className="voice-bar w-1 rounded-full bg-[#9d16e0]" style={{ animationDelay: '300ms' }} />
                            </span>
                            <span className="truncate text-sm text-gray-600 dark:text-gray-300">{voice.interim || 'Слушаю…'}</span>
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTask(); } }}
                            rows={1}
                            placeholder="Поставьте задачу оркестратору…"
                            className="flex-1 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none max-h-32"
                        />
                        {voice.supported && (
                            <button onClick={voice.toggle} title="Голосовой ввод" className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${voice.listening ? 'bg-[#5b32d4] text-white voice-pulse-purple' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}><Icons.Mic className="w-4 h-4" /></button>
                        )}
                        <button onClick={sendTask} disabled={!input.trim()} className="w-11 h-11 rounded-2xl bg-[#5b32d4] hover:bg-[#4c28b8] disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors">
                            <Icons.Send />
                        </button>
                    </div>
                </div>

                {showLinkMenu && (
                    <SubordinateLinkMenu
                        orchestrator={orchestrator}
                        state={state}
                        updateState={updateState}
                        onClose={() => setShowLinkMenu(false)}
                    />
                )}
            </div>
        </div>
    );
}

// Кнопка-«прибор» на панели управления
function CockpitBtn({ icon: IconC, label, onClick, accent }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors ${accent ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 hover:bg-[#e5e0f7]' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >
            <IconC className="w-4 h-4" />
            {label}
        </button>
    );
}
