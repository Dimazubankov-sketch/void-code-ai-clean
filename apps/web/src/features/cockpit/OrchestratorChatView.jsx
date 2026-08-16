import { useState, useRef, useEffect } from 'react';
import { SubordinateLinkMenu } from '@/features/cockpit/SubordinateLinkMenu';
import { OrchestratorMessages } from '@/features/cockpit/OrchestratorMessages';
import { useOrchestratorThread } from '@/features/cockpit/useOrchestratorThread';
import { ScheduleTaskModal } from '@/features/cockpit/ScheduleTaskModal';
import { ChatInputBar } from '@/features/chat/ChatInputBar';
import { AgentPlusMenu } from '@/features/cockpit/AgentPlusMenu';
import { getAgentStatus, resolveCockpitStatus } from '@/shared/config/orchestrator';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// OrchestratorChatView — «кабина» управления оркестратором
// ==========================================
// Открывается поверх Cockpit как отдельное окно чата (мобильный формат, не на
// весь экран). Это «кабина самолёта»: вся приборная панель — сверху (инфо об
// оркестраторе, статус, счётчик подчинённых, привязка агентов, почта, пауза/
// запуск, статус-лента подчинённых), а снизу — сам чат с задачами и HITL.
// Чат и его контекст — ЕДИНЫЕ с вкладкой «Оповещения агентов» (см.
// useOrchestratorThread + OrchestratorMessages), это одна и та же система.

export function OrchestratorChatView({ state, updateState }) {
    const orchestrator = (state.aiAgents || []).find((a) => a.id === state.activeAgentId && a.kind === 'orchestrator');
    const [input, setInput] = useState('');
    const [image, setImage] = useState(null);
    const [showLinkMenu, setShowLinkMenu] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const endRef = useRef(null);
    const chatFileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const anyFileInputRef = useRef(null);

    const openFilePicker = (ref) => {
        setShowPlusMenu(false);
        requestAnimationFrame(() => ref.current?.click());
    };
    const addImageFile = (files) => {
        const file = files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onloadend = () => setImage(r.result);
        r.readAsDataURL(file);
    };

    const { thread, reports, subordinates, sendTask, respond, thinking } = useOrchestratorThread(state, updateState, orchestrator);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [thread.length, thinking]);

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

    const orchStatus = getAgentStatus(resolveCockpitStatus(orchestrator));

    const handleSend = () => { sendTask(input, image); setInput(''); setImage(null); };

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
                        <CockpitBtn icon={Icons.Robot} label={`Агенты ${subordinates.length}`} onClick={() => setShowLinkMenu(true)} accent />
                        <CockpitBtn icon={resolveCockpitStatus(orchestrator) === 'sleeping' ? Icons.Play : Icons.Pause} label={resolveCockpitStatus(orchestrator) === 'sleeping' ? 'Запуск' : 'Пауза'} onClick={toggleRun} />
                        <CockpitBtn icon={soundOn ? Icons.VolumeOn : Icons.VolumeOff} label={soundOn ? 'Звук' : 'Тихо'} onClick={toggleSound} />
                        <CockpitBtn icon={Icons.MailLogo} label="Почта" onClick={() => updateState({ showNotifications: true })} />
                        <CockpitBtn icon={Icons.Clock} label="План" onClick={() => setShowSchedule(true)} />
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

                {/* ===== ЛЕНТА ЧАТА (единая с «Оповещениями агентов») ===== */}
                <div className="flex-1 overflow-y-auto px-4 py-5">
                    <OrchestratorMessages
                        thread={thread}
                        reports={reports}
                        onRespond={respond}
                        thinking={thinking}
                        lang={state.lang || 'ru'}
                        emptyHint={<>Поставьте задачу — оркестратор разложит её<br />на подзадачи и предложит план.{subordinates.length === 0 && (
                            <><br /><button onClick={() => setShowLinkMenu(true)} className="text-xs text-[#5b32d4] font-bold mt-3 underline underline-offset-2">Привязать агентов →</button></>
                        )}</>}
                    />
                    <div ref={endRef} />
                </div>

                {/* Скрытые инпуты для камеры/фото/файлов */}
                <input type="file" ref={chatFileInputRef} accept="image/jpeg, image/png, image/webp, image/heic" className="hidden" onChange={(e) => { addImageFile(e.target.files); e.target.value = ''; }} />
                <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={(e) => { addImageFile(e.target.files); e.target.value = ''; }} />
                <input type="file" ref={anyFileInputRef} accept=".pdf,.doc,.docx,.txt,.csv,.json" className="hidden" onChange={(e) => { addImageFile(e.target.files); e.target.value = ''; }} />

                {/* ===== ВВОД — в едином стиле с основным чатом ===== */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard pb-safe shrink-0 relative">
                    <ChatInputBar
                        value={input}
                        onChange={setInput}
                        onSend={handleSend}
                        lang={state.lang || 'ru'}
                        voiceLang={state.voiceLang || 'ru-RU'}
                        placeholder="Поставьте задачу оркестратору…"
                        selectedImage={image}
                        onSelectImage={setImage}
                        onClearImage={() => setImage(null)}
                        onPlusClick={() => setShowPlusMenu(true)}
                    />
                    {showPlusMenu && (
                        <AgentPlusMenu
                            state={state}
                            updateState={updateState}
                            agentId={orchestrator.id}
                            onClose={() => setShowPlusMenu(false)}
                            onPickCamera={() => openFilePicker(cameraInputRef)}
                            onPickPhoto={() => openFilePicker(chatFileInputRef)}
                            onPickFile={() => openFilePicker(anyFileInputRef)}
                        />
                    )}
                </div>

                {showLinkMenu && (
                    <SubordinateLinkMenu
                        orchestrator={orchestrator}
                        state={state}
                        updateState={updateState}
                        onClose={() => setShowLinkMenu(false)}
                    />
                )}
                <ScheduleTaskModal
                    open={showSchedule}
                    onClose={() => setShowSchedule(false)}
                    agentId={orchestrator?.id}
                    agentName={orchestrator?.name}
                />
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
