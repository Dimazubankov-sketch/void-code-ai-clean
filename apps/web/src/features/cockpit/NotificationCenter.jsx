import { useState } from 'react';
import { buildExecutionPlan, formatPlanReport } from '@/shared/lib/orchestrator-engine';
import { playNotificationSound } from '@/shared/lib/sound';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// NOTIFICATION CENTER (Inbox) — почта как отдельное приложение
// ==========================================
// Три вкладки: «Обновления» (от системы Void Code с её аватаром),
// «Оповещения агентов» (отчёты оркестраторов с HITL), «Личная почта»
// (письма извне + возможность написать письмо). Разворачивается на весь
// экран; письмо открывается поверх списка со стрелкой «назад» слева.

const fmtTime = (ts) =>
    new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const initials = (str) => (str || '?').replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 2).toUpperCase();

// Аватар отправителя. Для системы Void Code — фирменный логотип (как на хабе).
function SenderAvatar({ system, from, size = 'w-9 h-9' }) {
    if (system) {
        return (
            <div className={`${size} rounded-full bg-[#f0edfb] dark:bg-purple-900/20 flex items-center justify-center shrink-0`}>
                <Icons.VoidLogo className="w-6 h-6" />
            </div>
        );
    }
    return <div className={`${size} rounded-full bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-white font-bold text-xs shrink-0`}>{initials(from)}</div>;
}

export function NotificationCenter({ state, updateState, onClose }) {
    const [tab, setTab] = useState('agents');
    const [expanded, setExpanded] = useState(false);
    const [openOrchestratorId, setOpenOrchestratorId] = useState(null);
    const [openLetter, setOpenLetter] = useState(null);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState({ to: '', subject: '', body: '', attachments: [] });

    const inbox = state.inbox || { updates: [], personal: [] };
    const orchestrators = (state.aiAgents || []).filter((a) => a.kind === 'orchestrator');
    const reports = state.orchestratorReports || {};
    const readUpdates = state.readUpdateIds || [];
    const readPersonal = state.readPersonalIds || [];

    const unreadUpdates = inbox.updates.filter(u => !readUpdates.includes(u.id)).length;
    const unreadPersonal = inbox.personal.filter(m => !readPersonal.includes(m.id)).length;
    const pendingReports = Object.values(reports).reduce((n, l) => n + l.filter(r => r.status === 'pending').length, 0);

    const TABS = [
        { id: 'updates', label: 'Обновления', icon: Icons.Info, count: unreadUpdates },
        { id: 'agents', label: 'Оповещения агентов', icon: Icons.RobotArmy, count: pendingReports },
        { id: 'personal', label: 'Личная почта', icon: Icons.Mail, count: unreadPersonal },
    ];

    const respondToReport = (orchestratorId, reportId, decision) => {
        updateState({ pendingHitl: { orchestratorId, reportId, decision } });
    };

    const toggleSound = (orchestratorId) => {
        const agents = (state.aiAgents || []).map((a) =>
            a.id === orchestratorId && a.orchestration
                ? { ...a, orchestration: { ...a.orchestration, soundEnabled: !a.orchestration.soundEnabled } }
                : a,
        );
        updateState({ aiAgents: agents });
    };

    // Переключатель уведомлений: при ВКЛючении играем звук-подтверждение (п.7)
    const toggleNotify = (field) => {
        const current = state[field] !== false;
        const next = !current;
        if (next) playNotificationSound(); // звук только при включении
        updateState({ [field]: next });
    };

    const selectTab = (id) => { setTab(id); setOpenOrchestratorId(null); setOpenLetter(null); setComposing(false); };

    // Открытие письма помечает его прочитанным (п.12 — пропадает бейдж)
    const openUpdate = (u) => {
        setOpenLetter({ ...u, kind: 'update' });
        if (!readUpdates.includes(u.id)) updateState({ readUpdateIds: [...readUpdates, u.id] });
    };
    const openPersonal = (m) => {
        setOpenLetter({ id: m.id, title: m.subject, from: m.from, body: m.preview, at: m.at, kind: 'personal' });
        if (!readPersonal.includes(m.id)) updateState({ readPersonalIds: [...readPersonal, m.id] });
    };

    const sendLetter = () => {
        if (!draft.to.trim() || !draft.subject.trim()) return;
        const now = Date.now();
        const sent = { id: `pm_${now}`, from: `Вы → ${draft.to.trim()}`, subject: draft.subject.trim(), preview: draft.body.trim() || '(без текста)', at: now };
        updateState({
            inbox: { ...inbox, personal: [sent, ...inbox.personal] },
            readPersonalIds: [...readPersonal, sent.id],
        });
        setDraft({ to: '', subject: '', body: '', attachments: [] });
        setComposing(false);
    };

    // Панель чтения письма (используется и на весь экран, и поверх списка)
    const LetterReader = ({ letter, onBack }) => (
        <div className="flex flex-col h-full bg-white dark:bg-darkCard">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                <button onClick={onBack} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                <span className="font-bold text-sm dark:text-white truncate">{letter.title}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                <h2 className="text-xl font-extrabold dark:text-white mb-4">{letter.title}</h2>
                <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100 dark:border-darkBorder">
                    <SenderAvatar system={letter.kind === 'update'} from={letter.from} size="w-11 h-11" />
                    <div>
                        <p className="font-bold text-sm dark:text-white">{letter.kind === 'update' ? 'Void Code AI' : letter.from}</p>
                        <p className="text-[11px] text-gray-400">{fmtTime(letter.at)}</p>
                    </div>
                </div>
                <p className="text-sm dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{letter.body}</p>
            </div>
        </div>
    );

    return (
        <div className={`fixed inset-0 z-[90] flex ${expanded ? '' : 'justify-end'} bg-black/30 backdrop-blur-sm fade-in`} onClick={onClose}>
            <div
                className={`bg-white dark:bg-darkCard shadow-2xl flex flex-col slide-in-right ${expanded ? 'w-full h-full' : 'w-full max-w-md h-full'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Шапка приложения-почты */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Icons.MailLogo className="w-9 h-9" />
                        <div>
                            <h3 className="font-extrabold text-lg dark:text-white leading-tight">Void Mail</h3>
                            <p className="text-[11px] text-gray-400">Почта Void Code</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setExpanded(v => !v)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400" title={expanded ? 'Свернуть' : 'Развернуть'}>
                            {expanded ? <Icons.Collapse className="w-5 h-5" /> : <Icons.Expand2 className="w-5 h-5" />}
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.X /></button>
                    </div>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* Боковая навигация в развёрнутом виде */}
                    {expanded && (
                        <div className="w-60 border-r border-gray-100 dark:border-darkBorder p-3 shrink-0">
                            {TABS.map((t) => {
                                const IconC = t.icon; const active = tab === t.id;
                                return (
                                    <button key={t.id} onClick={() => selectTab(t.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl mb-1 text-left transition-colors ${active ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                                        <IconC className="w-5 h-5 shrink-0" />
                                        <span className="flex-1 text-sm truncate">{t.label}</span>
                                        {t.count > 0 && <span className="text-[11px] font-bold text-white bg-[#5b32d4] rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">{t.count}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex-1 flex flex-col min-w-0 relative">
                        {/* Компактные табы сверху */}
                        {!expanded && (
                            <div className="flex border-b border-gray-100 dark:border-darkBorder px-2 shrink-0">
                                {TABS.map((t) => {
                                    const IconC = t.icon; const active = tab === t.id;
                                    return (
                                        <button key={t.id} onClick={() => selectTab(t.id)} className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold border-b-2 transition-colors ${active ? 'border-[#5b32d4] text-[#5b32d4]' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                                            <IconC className="w-4 h-4" />
                                            {t.label}
                                            {t.count > 0 && <span className="absolute top-1 right-1/4 text-[10px] font-bold text-white bg-[#5b32d4] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{t.count}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Контент вкладки */}
                        <div className="flex-1 overflow-y-auto">
                            {tab === 'updates' && (
                                <>
                                    <ToggleBar label="Уведомлять об обновлениях" value={state.notifyUpdates !== false} onToggle={() => toggleNotify('notifyUpdates')} />
                                    {inbox.updates.length === 0 ? <EmptyState icon={Icons.Info} text="Обновлений нет" /> : (
                                        <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                                            {inbox.updates.map((u) => (
                                                <button key={u.id} onClick={() => openUpdate(u)} className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                                    <SenderAvatar system from="Void Code" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="font-bold text-sm dark:text-white truncate">Void Code AI</p>
                                                            <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(u.at)}</span>
                                                        </div>
                                                        <p className="text-sm font-medium dark:text-gray-200 truncate">{u.title}</p>
                                                        <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{u.body}</p>
                                                    </div>
                                                    {!readUpdates.includes(u.id) && <span className="w-2 h-2 rounded-full bg-[#5b32d4] mt-2 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {tab === 'personal' && (
                                <>
                                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-gray-900/20">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => toggleNotify('notifyPersonal')} className={`relative w-11 h-6 rounded-full transition-colors ${state.notifyPersonal !== false ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${state.notifyPersonal !== false ? 'translate-x-5' : ''}`} />
                                            </button>
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Уведомления</span>
                                        </div>
                                        <button onClick={() => setComposing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5b32d4] hover:bg-[#4a26b0] text-white text-xs font-bold transition-colors">
                                            <Icons.Plus className="w-4 h-4" /> Написать
                                        </button>
                                    </div>
                                    {inbox.personal.length === 0 ? <EmptyState icon={Icons.Mail} text="Писем нет" /> : (
                                        <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                                            {inbox.personal.map((m) => (
                                                <button key={m.id} onClick={() => openPersonal(m)} className="w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                                    <SenderAvatar from={m.from} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="font-bold text-sm dark:text-white truncate">{m.from}</p>
                                                            <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(m.at)}</span>
                                                        </div>
                                                        <p className="text-sm font-medium dark:text-gray-200 truncate">{m.subject}</p>
                                                        <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{m.preview}</p>
                                                    </div>
                                                    {!readPersonal.includes(m.id) && <span className="w-2 h-2 rounded-full bg-[#5b32d4] mt-2 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {tab === 'agents' && (
                                openOrchestratorId
                                    ? <OrchestratorReports orchestrator={orchestrators.find(o => o.id === openOrchestratorId)} reports={reports[openOrchestratorId] || []} onBack={() => setOpenOrchestratorId(null)} onRespond={respondToReport} state={state} updateState={updateState} />
                                    : <OrchestratorList orchestrators={orchestrators} reports={reports} onOpen={setOpenOrchestratorId} onToggleSound={toggleSound} />
                            )}
                        </div>

                        {/* Читалка письма — поверх списка со стрелкой назад (оба режима, п.14) */}
                        {openLetter && (
                            <div className="absolute inset-0 z-10 slide-in-right">
                                <LetterReader letter={openLetter} onBack={() => setOpenLetter(null)} />
                            </div>
                        )}

                        {/* Составление письма */}
                        {composing && (
                            <div className="absolute inset-0 z-10 slide-in-right bg-white dark:bg-darkCard flex flex-col">
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                                    <button onClick={() => setComposing(false)} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                                    <span className="font-bold text-sm dark:text-white">Новое письмо</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                                    <input value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} placeholder="Кому (email)" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                                    <input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} placeholder="Тема" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                                    <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={8} placeholder="Текст письма…" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none" />
                                    {/* Вложения: фото и документы */}
                                    <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">
                                        <Icons.Paperclip className="w-4 h-4" /> Прикрепить фото или документ
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                                            className="hidden"
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }));
                                                setDraft(d => ({ ...d, attachments: [...d.attachments, ...files] }));
                                            }}
                                        />
                                    </label>
                                    {draft.attachments.length > 0 && (
                                        <div className="space-y-1.5">
                                            {draft.attachments.map((a, i) => (
                                                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
                                                    <Icons.Code className="w-4 h-4 text-[#5b32d4] shrink-0" />
                                                    <span className="flex-1 truncate dark:text-gray-200">{a.name}</span>
                                                    <span className="text-[11px] text-gray-400">{(a.size / 1024).toFixed(0)} КБ</span>
                                                    <button onClick={() => setDraft(d => ({ ...d, attachments: d.attachments.filter((_, j) => j !== i) }))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"><Icons.X className="w-3.5 h-3.5" /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0">
                                    <button onClick={sendLetter} disabled={!draft.to.trim() || !draft.subject.trim()} className="w-full py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors">Отправить</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ToggleBar({ label, value, onToggle }) {
    return (
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-gray-900/20">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</span>
            <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
            </button>
        </div>
    );
}

function OrchestratorList({ orchestrators, reports, onOpen, onToggleSound }) {
    if (!orchestrators.length) return <EmptyState icon={Icons.RobotArmy} text="У вас пока нет агентов-оркестраторов" />;
    return (
        <div className="divide-y divide-gray-50 dark:divide-darkBorder">
            {orchestrators.map((o) => {
                const list = reports[o.id] || [];
                const unread = list.filter((r) => r.status === 'pending').length;
                const soundOn = o.orchestration?.soundEnabled ?? true;
                return (
                    <div key={o.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <button onClick={() => onOpen(o.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                            <div className="w-10 h-10 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                                <Icons.RobotArmy className="w-5 h-5 text-[#5b32d4] dark:text-purple-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm dark:text-white truncate">{o.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">{o.orchestration?.email}</p>
                            </div>
                        </button>
                        {unread > 0 && <span className="text-[11px] font-bold text-white bg-[#5b32d4] rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">{unread}</span>}
                        <button onClick={() => onToggleSound(o.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400" title={soundOn ? 'Звук включён' : 'Звук выключен'}>
                            {soundOn ? <Icons.VolumeOn className="w-4 h-4" /> : <Icons.VolumeOff className="w-4 h-4" />}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

function OrchestratorReports({ orchestrator, reports, onBack, onRespond, state, updateState }) {
    const [task, setTask] = useState('');
    if (!orchestrator) return null;

    const subordinates = (state.aiAgents || []).filter(
        (a) => a.kind !== 'orchestrator' && (orchestrator.orchestration?.subordinateIds || []).includes(a.id),
    );

    // Дать задачу оркестратору прямо из почты — центр управления, не заходя в Void Code
    const sendTask = () => {
        const text = task.trim();
        if (!text) return;
        const plan = buildExecutionPlan(orchestrator, text, subordinates);
        const report = { id: plan.id, at: Date.now(), body: formatPlanReport(plan), status: 'pending', plan };
        const orchMsg = { id: `o_${Date.now()}`, role: 'orchestrator', text: report.body, at: Date.now(), reportId: plan.id, planStatus: 'pending' };
        const threads = { ...(state.orchestratorThreads || {}) };
        threads[orchestrator.id] = [...(threads[orchestrator.id] || []), { id: `u_${Date.now()}`, role: 'user', text, at: Date.now() }, orchMsg];
        const allReports = { ...(state.orchestratorReports || {}) };
        allReports[orchestrator.id] = [...(allReports[orchestrator.id] || []), report];
        updateState({ orchestratorThreads: threads, orchestratorReports: allReports });
        setTask('');
        if ((orchestrator.orchestration?.soundEnabled ?? true) && state.notificationsEnabled !== false) playNotificationSound();
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                <button onClick={onBack} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                <div className="min-w-0">
                    <p className="font-bold text-sm dark:text-white truncate">{orchestrator.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{orchestrator.orchestration?.email}</p>
                </div>
            </div>
            {reports.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 text-gray-300 dark:text-gray-600">
                    <Icons.RobotArmy className="w-12 h-12 mb-3" />
                    <p className="text-sm font-medium">Отчётов пока нет.<br />Поставьте задачу оркестратору ниже.</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {reports.map((r) => (
                        <div key={r.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4">
                            <p className="text-sm dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{r.body}</p>
                            <p className="text-[11px] text-gray-400 mt-2">{fmtTime(r.at)}</p>
                            {r.status === 'pending' && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => onRespond(orchestrator.id, r.id, 'approved')} className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-colors">Разрешить</button>
                                    <button onClick={() => onRespond(orchestrator.id, r.id, 'edited')} className="flex-1 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs font-bold transition-colors dark:text-white">Правка</button>
                                    <button onClick={() => onRespond(orchestrator.id, r.id, 'rejected')} className="flex-1 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 text-red-500 text-xs font-bold transition-colors">Отказ</button>
                                </div>
                            )}
                            {r.status === 'approved' && <StatusPill color="green" text="Одобрено — задачи разданы" />}
                            {r.status === 'rejected' && <StatusPill color="red" text="Отклонено" />}
                            {r.status === 'edited' && <StatusPill color="amber" text="Отправлено на правку" />}
                        </div>
                    ))}
                </div>
            )}
            {/* Ввод задачи прямо из почты */}
            <div className="p-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                <div className="flex items-end gap-2">
                    <textarea
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTask(); } }}
                        rows={1}
                        placeholder="Дать задачу оркестратору…"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none max-h-24"
                    />
                    <button onClick={sendTask} disabled={!task.trim()} className="w-10 h-10 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors">
                        <Icons.Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function StatusPill({ color, text }) {
    const map = {
        green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
        red: 'bg-red-50 dark:bg-red-900/20 text-red-500',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    };
    return <span className={`inline-block mt-3 text-[11px] font-bold px-2.5 py-1 rounded-lg ${map[color]}`}>{text}</span>;
}

function EmptyState({ icon: IconC, text }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16 text-gray-300 dark:text-gray-600">
            <IconC className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">{text}</p>
        </div>
    );
}
