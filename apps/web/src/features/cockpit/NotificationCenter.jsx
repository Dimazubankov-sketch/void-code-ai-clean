import { useEffect, useRef, useState } from 'react';
import { MailAgentChat } from '@/features/cockpit/MailAgentChat';
import { switchToAccount } from '@/shared/lib/accounts';
import { buildExecutionPlan, formatPlanReport } from '@/shared/lib/orchestrator-engine';
import { playNotificationSound } from '@/shared/lib/sound';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// NOTIFICATION CENTER (Void Mail) — полноценное почтовое приложение
// ==========================================
// Боковое меню (бургер / свайп на телефоне) с папками: Все письма,
// Обновления, Оповещения агентов, Личная почта, Отправленные, Помеченные,
// Черновики, Корзина, Настройки. Логотип в шапке меню открывает переключатель
// аккаунтов. На ПК панель по умолчанию занимает ~1/3 экрана и плавно
// разворачивается на весь экран по кнопке.

const fmtTime = (ts) =>
    new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const initials = (str) => (str || '?').replace(/[^a-zA-Zа-яА-Я0-9]/g, '').slice(0, 2).toUpperCase();

function SenderAvatar({ system, from, size = 'w-9 h-9' }) {
    if (system) {
        return (
            <div className={`${size} rounded-full bg-[#f0edfb] dark:bg-purple-900/20 flex items-center justify-center shrink-0 overflow-hidden`}>
                <Icons.VoidLogo className="w-[85%] h-[85%]" />
            </div>
        );
    }
    return <div className={`${size} rounded-full bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-white font-bold text-xs shrink-0`}>{initials(from)}</div>;
}

const FOLDERS = [
    { id: 'all', label: 'Все письма', icon: Icons.MailLogoFlat },
    { id: 'updates', label: 'Обновления', icon: Icons.Info },
    { id: 'agents', label: 'Оповещения агентов', icon: Icons.Robot },
    { id: 'personal', label: 'Личная почта', icon: Icons.Mail },
    { id: 'sent', label: 'Отправленные', icon: Icons.Send },
    { id: 'starred', label: 'Помеченные', icon: Icons.Star },
    { id: 'drafts', label: 'Черновики', icon: Icons.Pencil },
    { id: 'trash', label: 'Корзина', icon: Icons.Trash },
    { id: 'settings', label: 'Настройки', icon: Icons.Settings },
];

export function NotificationCenter({ state, updateState, onClose }) {
    const [expanded, setExpanded] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarClosing, setSidebarClosing] = useState(false);
    // Закрытие с анимацией: панель уезжает влево, потом размонтируется
    const closeSidebar = () => {
        if (sidebarClosing) return;
        setSidebarClosing(true);
        setTimeout(() => { setSidebarOpen(false); setSidebarClosing(false); }, 260);
    };
    const [activeFolder, setActiveFolder] = useState('all');
    const [openOrchestratorId, setOpenOrchestratorId] = useState(null);
    const [openLetter, setOpenLetter] = useState(null);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState({ id: null, to: '', subject: '', body: '', attachments: [] });
    const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
    const [accountManageMode, setAccountManageMode] = useState(false);
    const photoInputRef = useRef(null);
    const [mailSearch, setMailSearch] = useState('');
    const touchStartX = useRef(null);

    const rawInbox = state.inbox || {};
    const inbox = {
        updates: rawInbox.updates || [],
        personal: rawInbox.personal || [],
        sent: rawInbox.sent || [],
        drafts: rawInbox.drafts || [],
        trash: rawInbox.trash || [],
    };
    const orchestrators = (state.aiAgents || []).filter((a) => a.kind === 'orchestrator');
    const reports = state.orchestratorReports || {};
    const readUpdates = state.readUpdateIds || [];
    const readPersonal = state.readPersonalIds || [];
    const starred = state.starredIds || [];

    const unreadUpdates = inbox.updates.filter(u => !readUpdates.includes(u.id)).length;
    const unreadPersonal = inbox.personal.filter(m => !readPersonal.includes(m.id)).length;
    const pendingReports = Object.values(reports).reduce((n, l) => n + l.filter(r => r.status === 'pending').length, 0);
    const totalUnread = unreadUpdates + unreadPersonal + pendingReports;

    const FOLDER_COUNTS = {
        all: totalUnread,
        updates: unreadUpdates,
        agents: pendingReports,
        personal: unreadPersonal,
        sent: 0,
        starred: 0,
        drafts: inbox.drafts.length,
        trash: 0,
        settings: 0,
    };

    // --- Свайп для открытия/закрытия бокового меню папок на телефоне ---
    // Свайп вправо от левой части экрана открывает меню, свайп влево закрывает.
    const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
    const onTouchEnd = (e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        // Открытие: жест начат в левой трети экрана и палец ушёл вправо
        if (!sidebarOpen && touchStartX.current < 120 && dx > 55) setSidebarOpen(true);
        // Закрытие: свайп влево при открытом меню
        if (sidebarOpen && dx < -55) closeSidebar();
        touchStartX.current = null;
    };

    const respondToReport = (orchestratorId, reportId, decision) => {
        updateState({ pendingHitl: { orchestratorId, reportId, decision } });
    };

    const toggleAgentSound = (orchestratorId) => {
        const agents = (state.aiAgents || []).map((a) =>
            a.id === orchestratorId && a.orchestration
                ? { ...a, orchestration: { ...a.orchestration, soundEnabled: !a.orchestration.soundEnabled } }
                : a,
        );
        updateState({ aiAgents: agents });
    };

    const toggleNotify = (field) => {
        const current = state[field] !== false;
        const next = !current;
        if (next) playNotificationSound();
        updateState({ [field]: next });
    };

    const goFolder = (id) => { setActiveFolder(id); setOpenOrchestratorId(null); setOpenLetter(null); setComposing(false); closeSidebar(); };

    const openUpdate = (u) => {
        setOpenLetter({ ...u, kind: 'update' });
        if (!readUpdates.includes(u.id)) updateState({ readUpdateIds: [...readUpdates, u.id] });
    };
    const openPersonal = (m) => {
        setOpenLetter({ id: m.id, kind: 'personal', title: m.subject, from: m.from, body: m.preview, at: m.at });
        if (!readPersonal.includes(m.id)) updateState({ readPersonalIds: [...readPersonal, m.id] });
    };
    const openSent = (m) => setOpenLetter({ id: m.id, kind: 'sent', title: m.subject, from: `Кому: ${m.to}`, body: m.body, at: m.at });

    // --- Звезда: работает для обновлений/личных/отправленных ---
    const toggleStar = (id) => {
        updateState({ starredIds: starred.includes(id) ? starred.filter(x => x !== id) : [...starred, id] });
    };

    // --- Удаление в корзину (для всего, кроме отчётов оркестраторов) ---
    const deleteToTrash = (kind, item) => {
        const now = Date.now();
        const trashEntry = { ...item, kind, deletedAt: now };
        const nextInbox = { ...inbox, [kind === 'update' ? 'updates' : kind]: (inbox[kind === 'update' ? 'updates' : kind] || []).filter(x => x.id !== item.id), trash: [trashEntry, ...inbox.trash] };
        updateState({ inbox: nextInbox, starredIds: starred.filter(x => x !== item.id) });
        setOpenLetter(null);
    };
    const restoreFromTrash = (item) => {
        const targetKey = item.kind === 'update' ? 'updates' : item.kind;
        const { kind, deletedAt, ...clean } = item;
        const nextInbox = { ...inbox, [targetKey]: [clean, ...(inbox[targetKey] || [])], trash: inbox.trash.filter(x => x.id !== item.id) };
        updateState({ inbox: nextInbox });
    };
    const purgeFromTrash = (id) => updateState({ inbox: { ...inbox, trash: inbox.trash.filter(x => x.id !== id) } });

    // --- Составление письма ---
    const openCompose = (existingDraft) => {
        setDraft(existingDraft ? { ...existingDraft, attachments: existingDraft.attachments || [] } : { id: null, to: '', subject: '', body: '', attachments: [] });
        setComposing(true);
    };
    const hasDraftContent = () => draft.to.trim() || draft.subject.trim() || draft.body.trim();

    const saveDraft = () => {
        if (!hasDraftContent()) return;
        const now = Date.now();
        const entry = { id: draft.id || `dr_${now}`, to: draft.to, subject: draft.subject, body: draft.body, attachments: draft.attachments, savedAt: now };
        const nextDrafts = draft.id ? inbox.drafts.map(d => d.id === draft.id ? entry : d) : [entry, ...inbox.drafts];
        updateState({ inbox: { ...inbox, drafts: nextDrafts } });
        return entry.id;
    };
    // Закрытие без отправки — автосохранение черновика (п.3, п.6)
    const closeCompose = () => {
        if (hasDraftContent()) saveDraft();
        setComposing(false);
    };
    const sendLetter = () => {
        if (!draft.to.trim() || !draft.subject.trim()) return;
        const now = Date.now();
        const sent = { id: `sent_${now}`, to: draft.to.trim(), subject: draft.subject.trim(), body: draft.body.trim() || '(без текста)', attachments: draft.attachments, at: now };
        const nextDrafts = draft.id ? inbox.drafts.filter(d => d.id !== draft.id) : inbox.drafts;
        updateState({ inbox: { ...inbox, sent: [sent, ...inbox.sent], drafts: nextDrafts } });
        setDraft({ id: null, to: '', subject: '', body: '', attachments: [] });
        setComposing(false);
    };

    // Автосохранение черновика, если приложение свернули или переключили вкладку,
    // пока открыто окно составления письма (не только при закрытии кнопкой назад)
    useEffect(() => {
        if (!composing) return;
        const handler = () => {
            if (document.visibilityState === 'hidden' && hasDraftContent()) saveDraft();
        };
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    }, [composing, draft]);

    // --- Переключатель аккаунтов ---
    const accounts = state.savedAccounts || [];
    const accountPhotos = state.accountPhotos || {};
    const doSwitchAccount = (email) => { switchToAccount(state, updateState, email); setShowAccountSwitcher(false); setAccountManageMode(false); };
    const loginAnother = () => { setShowAccountSwitcher(false); setAccountManageMode(false); updateState({ showAuthModal: true, authTab: 'login' }); };
    const createNew = () => { setShowAccountSwitcher(false); setAccountManageMode(false); updateState({ showAuthModal: true, authTab: 'register' }); };
    const closeAccounts = () => { setShowAccountSwitcher(false); setAccountManageMode(false); };
    // Смена фото профиля текущего аккаунта — читаем файл в dataURL и кладём в accountPhotos
    const onChangePhoto = (e) => {
        const file = e.target.files?.[0];
        if (!file || !state.user) return;
        const reader = new FileReader();
        reader.onload = () => updateState({ accountPhotos: { ...accountPhotos, [state.user.email]: reader.result } });
        reader.readAsDataURL(file);
    };

    // Комбинированная лента «Все письма»: обновления + личные + отправленные
    // Фильтр поиска по письмам: по теме, тексту и отправителю/адресату
    const matchesSearch = (item) => {
        const q = mailSearch.trim().toLowerCase();
        if (!q) return true;
        const hay = [
            item.title, item.subject, item.body, item.preview, item.from, item.to,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    };

    const combinedAll = [
        ...inbox.updates.map(u => ({ ...u, kind: 'update', sortAt: u.at })),
        ...inbox.personal.map(m => ({ ...m, kind: 'personal', sortAt: m.at })),
        ...inbox.sent.map(m => ({ ...m, kind: 'sent', sortAt: m.at })),
    ].filter(matchesSearch).sort((a, b) => b.sortAt - a.sortAt);

    const starredItems = [
        ...inbox.updates.map(u => ({ ...u, kind: 'update' })),
        ...inbox.personal.map(m => ({ ...m, kind: 'personal' })),
        ...inbox.sent.map(m => ({ ...m, kind: 'sent' })),
    ].filter(x => starred.includes(x.id)).filter(matchesSearch).sort((a, b) => b.at - a.at);

    const openByKind = (item) => {
        if (item.kind === 'update') openUpdate(item);
        else if (item.kind === 'personal') openPersonal(item);
        else if (item.kind === 'sent') openSent(item);
    };

    const LetterReader = ({ letter, onBack }) => (
        <div className="flex flex-col h-full bg-white dark:bg-darkCard">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                <button onClick={onBack} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                <span className="font-bold text-sm dark:text-white truncate flex-1">{letter.title}</span>
                <button onClick={() => toggleStar(letter.id)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Пометить звёздочкой">
                    <Icons.Star className={`w-4 h-4 ${starred.includes(letter.id) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} style={starred.includes(letter.id) ? { fill: 'currentColor' } : {}} />
                </button>
                <button onClick={() => deleteToTrash(letter.kind, letter)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400" title="Удалить">
                    <Icons.Trash className="w-4 h-4" />
                </button>
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

    // Строка письма в списке (переиспользуется во всех папках)
    const LetterRow = ({ item }) => {
        const isSent = item.kind === 'sent';
        const displayFrom = isSent ? `Кому: ${item.to}` : (item.kind === 'update' ? 'Void Code AI' : item.from);
        const displayTitle = item.kind === 'update' ? item.title : (item.subject || item.title);
        const displayPreview = item.kind === 'update' ? item.body : (item.preview || item.body);
        const unread = item.kind === 'update' ? !readUpdates.includes(item.id) : item.kind === 'personal' ? !readPersonal.includes(item.id) : false;
        return (
            <div className="flex items-center gap-1 px-2 group">
                <button onClick={() => openByKind(item)} className="flex-1 min-w-0 flex items-start gap-3 py-3 text-left rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors px-3">
                    <SenderAvatar system={item.kind === 'update'} from={displayFrom} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-sm dark:text-white truncate">{displayFrom}</p>
                            <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(item.at)}</span>
                        </div>
                        <p className="text-sm font-medium dark:text-gray-200 truncate">{displayTitle}</p>
                        <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate">{displayPreview}</p>
                    </div>
                    {unread && <span className="w-2 h-2 rounded-full bg-[#5b32d4] mt-2 shrink-0" />}
                </button>
                <button onClick={() => toggleStar(item.id)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" title="Пометить звёздочкой">
                    <Icons.Star className={`w-4 h-4 ${starred.includes(item.id) ? 'text-amber-400' : 'text-gray-300'}`} style={starred.includes(item.id) ? { fill: 'currentColor' } : {}} />
                </button>
                <button onClick={() => deleteToTrash(item.kind, item)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" title="Удалить">
                    <Icons.Trash className="w-4 h-4" />
                </button>
            </div>
        );
    };

    const renderFolderContent = () => {
        if (activeFolder === 'all') {
            return combinedAll.length === 0 ? <EmptyState icon={Icons.MailLogoFlat} text="Писем нет" /> : (
                <div className="py-1">{combinedAll.map(item => <LetterRow key={item.id} item={item} />)}</div>
            );
        }
        if (activeFolder === 'updates') {
            return (
                <>
                    <ToggleBar label="Уведомлять об обновлениях" value={state.notifyUpdates !== false} onToggle={() => toggleNotify('notifyUpdates')} />
                    {inbox.updates.length === 0 ? <EmptyState icon={Icons.Info} text="Обновлений нет" /> : <div className="py-1">{inbox.updates.map(u => <LetterRow key={u.id} item={{ ...u, kind: 'update' }} />)}</div>}
                </>
            );
        }
        if (activeFolder === 'personal') {
            return (
                <>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-gray-900/20">
                        <div className="flex items-center gap-2">
                            <button onClick={() => toggleNotify('notifyPersonal')} className={`relative w-11 h-6 rounded-full transition-colors ${state.notifyPersonal !== false ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${state.notifyPersonal !== false ? 'translate-x-5' : ''}`} />
                            </button>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Уведомления</span>
                        </div>
                        <button onClick={() => openCompose(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5b32d4] hover:bg-[#4a26b0] text-white text-xs font-bold transition-colors">
                            <Icons.Plus className="w-4 h-4" /> Написать
                        </button>
                    </div>
                    {inbox.personal.length === 0 ? <EmptyState icon={Icons.Mail} text="Писем нет" /> : <div className="py-1">{inbox.personal.map(m => <LetterRow key={m.id} item={{ ...m, kind: 'personal' }} />)}</div>}
                </>
            );
        }
        if (activeFolder === 'sent') {
            return inbox.sent.length === 0 ? <EmptyState icon={Icons.Send} text="Отправленных писем нет" /> : <div className="py-1">{inbox.sent.map(m => <LetterRow key={m.id} item={{ ...m, kind: 'sent' }} />)}</div>;
        }
        if (activeFolder === 'starred') {
            return starredItems.length === 0 ? <EmptyState icon={Icons.Star} text="Помеченных писем нет" /> : <div className="py-1">{starredItems.map(item => <LetterRow key={item.id} item={item} />)}</div>;
        }
        if (activeFolder === 'drafts') {
            return inbox.drafts.length === 0 ? <EmptyState icon={Icons.Pencil} text="Черновиков нет" /> : (
                <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                    {inbox.drafts.map(d => (
                        <div key={d.id} className="flex items-center gap-2 px-2">
                            <button onClick={() => openCompose(d)} className="flex-1 min-w-0 text-left px-3 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-xl transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-bold text-sm dark:text-white truncate">{d.to || 'Без адресата'}</p>
                                    <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(d.savedAt)}</span>
                                </div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{d.subject || '(без темы)'}</p>
                            </button>
                            <button onClick={() => updateState({ inbox: { ...inbox, drafts: inbox.drafts.filter(x => x.id !== d.id) } })} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 shrink-0"><Icons.Trash className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
            );
        }
        if (activeFolder === 'trash') {
            return inbox.trash.length === 0 ? <EmptyState icon={Icons.Trash} text="Корзина пуста" /> : (
                <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                    {inbox.trash.map(item => {
                        const title = item.kind === 'update' ? item.title : (item.subject || item.title);
                        const from = item.kind === 'sent' ? `Кому: ${item.to}` : (item.kind === 'update' ? 'Void Code AI' : item.from);
                        return (
                            <div key={item.id} className="flex items-center gap-2 px-2">
                                <div className="flex-1 min-w-0 px-3 py-3.5">
                                    <p className="font-bold text-sm dark:text-white truncate">{from}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{title}</p>
                                    <p className="text-[11px] text-gray-400">Удалено {fmtTime(item.deletedAt)}</p>
                                </div>
                                <button onClick={() => restoreFromTrash(item)} className="text-xs font-bold text-[#5b32d4] px-2.5 py-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 shrink-0">Восстановить</button>
                                <button onClick={() => purgeFromTrash(item.id)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 shrink-0"><Icons.X className="w-4 h-4" /></button>
                            </div>
                        );
                    })}
                </div>
            );
        }
        if (activeFolder === 'settings') {
            return (
                <div className="p-5 space-y-4">
                    <SettingsToggleRow label="Уведомления об обновлениях" value={state.notifyUpdates !== false} onToggle={() => toggleNotify('notifyUpdates')} />
                    <SettingsToggleRow label="Уведомления о личной почте" value={state.notifyPersonal !== false} onToggle={() => toggleNotify('notifyPersonal')} />
                    <div className="pt-2 border-t border-gray-100 dark:border-darkBorder">
                        <p className="text-xs text-gray-400 leading-relaxed">Звук для каждого оркестратора настраивается отдельно во вкладке «Оповещения агентов» — рядом с именем оркестратора есть значок динамика.</p>
                    </div>
                </div>
            );
        }
        if (activeFolder === 'agents') {
            return <MailAgentChat state={state} updateState={updateState} />;
        }
        return null;
    };

    const activeFolderMeta = FOLDERS.find(f => f.id === activeFolder);

    return (
        <div className={`fixed inset-x-0 top-0 h-app-screen z-[90] flex justify-end bg-black/30 backdrop-blur-sm fade-in`} onClick={onClose}>
            <div
                className={`relative bg-white dark:bg-darkCard shadow-2xl flex flex-col slide-in-right transition-all duration-500 ease-in-out h-full ${expanded ? 'w-full' : 'w-full sm:w-[420px] md:w-[34vw] md:max-w-[560px]'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Шапка приложения-почты */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0" title="Меню папок">
                        <Icons.TwoLines className="w-5 h-5" />
                    </button>
                    {/* Поиск по письмам вместо логотипа и надписи Void Mail */}
                    <div className="relative flex-1 min-w-0">
                        <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={mailSearch}
                            onChange={(e) => setMailSearch(e.target.value)}
                            placeholder="Поиск в почте…"
                            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setExpanded(v => !v)} className="hidden sm:flex p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400" title={expanded ? 'Свернуть' : 'На весь экран'}>
                            {expanded ? <Icons.Collapse className="w-5 h-5" /> : <Icons.Expand2 className="w-5 h-5" />}
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.X /></button>
                    </div>
                </div>

                {/* Область письма/списка со свайпом на телефоне */}
                <div className="flex-1 relative min-h-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                    <div className="h-full overflow-y-auto">{renderFolderContent()}</div>

                    {openLetter && (
                        <div className="absolute inset-0 z-10 slide-in-right"><LetterReader letter={openLetter} onBack={() => setOpenLetter(null)} /></div>
                    )}

                    {composing && (
                        <div className="absolute inset-0 z-10 slide-in-right bg-white dark:bg-darkCard flex flex-col">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                                <button onClick={closeCompose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                                <span className="font-bold text-sm dark:text-white flex-1">Новое письмо</span>
                                <button onClick={saveDraft} className="text-xs font-bold text-[#5b32d4] px-2.5 py-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20">В черновики</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                                <input value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} placeholder="Кому (email)" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                                <input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} placeholder="Тема" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4]" />
                                <textarea value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={8} placeholder="Текст письма…" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none" />
                                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-[#5b32d4] hover:text-[#5b32d4] transition-colors">
                                    <Icons.Paperclip className="w-4 h-4" /> Прикрепить фото или документ
                                    <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.zip" className="hidden" onChange={(e) => {
                                        const files = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size }));
                                        setDraft(d => ({ ...d, attachments: [...d.attachments, ...files] }));
                                    }} />
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
                            <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0 flex gap-2">
                                <button onClick={saveDraft} className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm transition-colors">Сохранить</button>
                                <button onClick={sendLetter} disabled={!draft.to.trim() || !draft.subject.trim()} className="flex-1 py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors">Отправить</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ===== БОКОВОЕ МЕНЮ ПАПОК ===== */}
                {sidebarOpen && (
                    <div className="absolute inset-0 z-20 flex" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                        <div className={`w-72 max-w-[80%] h-full bg-white dark:bg-darkCard shadow-2xl flex flex-col ${sidebarClosing ? 'slide-out-left' : 'slide-in-left'}`}>
                            {/* Логотип + Voidops — клик открывает переключатель аккаунтов */}
                            <button onClick={() => { setShowAccountSwitcher(true); }} className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100 dark:border-darkBorder hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left">
                                <Icons.MailLogo className="w-8 h-8" />
                                <span className="font-extrabold text-lg dark:text-white">Voidops</span>
                            </button>
                            <div className="flex-1 overflow-y-auto py-2">
                                {FOLDERS.map(f => {
                                    const IconC = f.icon; const active = activeFolder === f.id; const count = FOLDER_COUNTS[f.id];
                                    return (
                                        <button key={f.id} onClick={() => goFolder(f.id)} className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${active ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                                            <IconC className="w-5 h-5 shrink-0" />
                                            <span className="flex-1 text-sm truncate">{f.label}</span>
                                            {count > 0 && <span className="text-[11px] font-bold text-white bg-[#5b32d4] rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">{count}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex-1" onClick={closeSidebar} />
                    </div>
                )}

                {/* ===== ОКНО «АККАУНТЫ VOIDOPS» ===== */}
                {showAccountSwitcher && (
                    <div className="absolute inset-0 z-30 bg-black/40 flex justify-end sm:justify-start" onClick={closeAccounts}>
                        <div className="w-full sm:w-1/3 sm:min-w-[340px] h-full bg-white dark:bg-darkCard shadow-2xl slide-in-right flex flex-col" onClick={e => e.stopPropagation()}>
                            {/* Шапка */}
                            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                                <button onClick={closeAccounts} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                                <h4 className="font-extrabold text-lg dark:text-white">Аккаунты Voidops</h4>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5">
                                {/* Текущий аккаунт с возможностью сменить фото */}
                                {state.user ? (
                                    <div className="flex flex-col items-center text-center mb-6">
                                        <button onClick={() => photoInputRef.current?.click()} className="relative group">
                                            {accountPhotos[state.user.email] ? (
                                                <img src={accountPhotos[state.user.email]} alt="" className="w-20 h-20 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-20 h-20 rounded-full bg-[#5b32d4] text-white flex items-center justify-center font-extrabold text-2xl">{initials(state.user.name)}</div>
                                            )}
                                            <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Icons.Pencil className="w-5 h-5 text-white" />
                                            </span>
                                        </button>
                                        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onChangePhoto} />
                                        <p className="font-extrabold text-lg dark:text-white mt-3">{state.user.name}</p>
                                        <p className="text-sm text-gray-400">{state.user.email}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">Тариф: {state.userPlan}</p>
                                        <button onClick={() => photoInputRef.current?.click()} className="text-xs font-bold text-[#5b32d4] mt-2">Сменить фото</button>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 text-center mb-6">Вы не вошли в аккаунт</p>
                                )}

                                {/* Управлять аккаунтом */}
                                {state.user && (
                                    <button onClick={() => setAccountManageMode(v => !v)} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-bold dark:text-white transition-colors mb-2">
                                        <span className="flex items-center gap-2.5"><Icons.Settings className="w-4 h-4" /> Управлять аккаунтом</span>
                                        <Icons.ChevronLeft className={`w-4 h-4 transition-transform ${accountManageMode ? 'rotate-90' : '-rotate-90'}`} />
                                    </button>
                                )}
                                {accountManageMode && (
                                    <div className="mb-4 px-4 py-3 rounded-2xl bg-gray-50/60 dark:bg-gray-900/20 space-y-2">
                                        <button className="w-full text-left text-sm text-gray-600 dark:text-gray-300 py-1.5">Изменить имя профиля</button>
                                        <button className="w-full text-left text-sm text-gray-600 dark:text-gray-300 py-1.5">Безопасность и пароль</button>
                                        <button onClick={() => updateState({ currentView: 'pricing', showNotifications: false })} className="w-full text-left text-sm text-gray-600 dark:text-gray-300 py-1.5">Управление подпиской</button>
                                    </div>
                                )}

                                {/* Сменить аккаунт */}
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 px-1 mb-2 mt-4">Сменить аккаунт</p>
                                <div className="space-y-1.5 mb-5">
                                    {accounts.length === 0 && <p className="text-sm text-gray-400 px-1">Сохранённых аккаунтов нет</p>}
                                    {accounts.map(acc => (
                                        <button key={acc.email} onClick={() => doSwitchAccount(acc.email)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${state.user?.email === acc.email ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                                            {accountPhotos[acc.email] ? (
                                                <img src={accountPhotos[acc.email]} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-full bg-[#5b32d4] text-white flex items-center justify-center font-bold text-xs shrink-0">{initials(acc.name)}</div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm dark:text-white truncate">{acc.email}</p>
                                                <p className="text-[11px] text-gray-400">Тариф: {acc.plan}</p>
                                            </div>
                                            {state.user?.email === acc.email && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Нижние кнопки */}
                            <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0 flex gap-2">
                                <button onClick={loginAnother} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm transition-colors">Войти в другой</button>
                                <button onClick={createNew} className="flex-1 py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">Создать новый</button>
                            </div>
                        </div>
                    </div>
                )}
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

function SettingsToggleRow({ label, value, onToggle }) {
    return (
        <div className="flex items-center justify-between py-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
            <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
            </button>
        </div>
    );
}

function OrchestratorList({ orchestrators, reports, onOpen, onToggleSound }) {
    if (!orchestrators.length) return <EmptyState icon={Icons.Robot} text="У вас пока нет агентов-оркестраторов" />;
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
                                <Icons.Robot className="w-5 h-5 text-[#5b32d4] dark:text-purple-400" />
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

    const sendTask = () => {
        const text = task.trim();
        if (!text) return;
        const plan = buildExecutionPlan(orchestrator, text, subordinates);
        const report = { id: plan.id, at: Date.now(), body: formatPlanReport(plan), status: 'pending', plan };
        const threads = { ...(state.orchestratorThreads || {}) };
        threads[orchestrator.id] = [...(threads[orchestrator.id] || []), { id: `u_${Date.now()}`, role: 'user', text, at: Date.now() }, { id: `o_${Date.now()}`, role: 'orchestrator', text: report.body, at: Date.now(), reportId: plan.id, planStatus: 'pending' }];
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
                    <Icons.Robot className="w-12 h-12 mb-3" />
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
            <div className="p-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                <div className="flex items-end gap-2">
                    <textarea value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTask(); } }} rows={1} placeholder="Дать задачу оркестратору…" className="flex-1 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none max-h-24" />
                    <button onClick={sendTask} disabled={!task.trim()} className="w-10 h-10 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors"><Icons.Send className="w-4 h-4" /></button>
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
