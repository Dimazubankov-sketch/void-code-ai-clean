import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { MailAgentChat } from '@/features/cockpit/MailAgentChat';
import { switchToAccount } from '@/shared/lib/accounts';
import { playNotificationSound } from '@/shared/lib/sound';
import {
    fetchMailAddress,
    fetchFolder,
    fetchMailMessage,
    setMailRead,
    deleteMailMessage,
    createDraft,
    updateDraft,
    sendMail,
} from '@/shared/api/mail';
import { ApiError } from '@/shared/api/client';
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

// Папки почты Void Mail. 'inbox' / 'sent' / 'drafts' / 'trash' — реальные
// папки на бэкенде (см. apps/api/src/modules/mail), письма в них хранятся
// в БД и переживают перезагрузку страницы/смену устройства. 'updates' и
// 'agents' — системные ленты (обновления платформы, отчёты оркестраторов),
// они устроены отдельно и почты не касаются — не трогаем их логику.
const FOLDERS = [
    { id: 'all', label: 'Все письма', icon: Icons.MailLogoFlat },
    { id: 'updates', label: 'Обновления', icon: Icons.Info },
    { id: 'agents', label: 'Оповещения агентов', icon: Icons.Robot },
    { id: 'inbox', label: 'Личная почта', icon: Icons.Mail },
    { id: 'sent', label: 'Отправленные', icon: Icons.Send },
    { id: 'starred', label: 'Помеченные', icon: Icons.Star },
    { id: 'drafts', label: 'Черновики', icon: Icons.Pencil },
    { id: 'trash', label: 'Корзина', icon: Icons.Trash },
    { id: 'settings', label: 'Настройки', icon: Icons.Settings },
];

// Папки, реально хранящиеся на бэкенде (в БД) — для остальных ('all',
// 'updates', 'agents', 'starred', 'settings') используется другая логика.
const BACKEND_FOLDERS = ['inbox', 'sent', 'drafts', 'trash'];

export function NotificationCenter({ state, updateState, onClose }) {
    const [expanded, setExpanded] = useState(false);
    // ==========================================
    // GSAP-анимация раскрытия/сворачивания почты на весь экран (ПК)
    // ==========================================
    // Раньше ширина панели переключалась чистым Tailwind-классом
    // (w-[420px]/w-[34vw] ↔ w-full) с CSS transition-all — открытие
    // выглядело плавно, а вот сворачивание «прыгало»: между
    // адаптивными width-классами (sm:/md:) при смене на голый w-full нет
    // единого числового значения, от которого браузер может честно
    // интерполировать transition. Решение — явно анимировать ширину
    // числом через GSAP: перед раскрытием запоминаем текущую (узкую)
    // ширину панели в пикселях, дальше твиним к 100%, а при сворачивании —
    // твиним обратно к запомненному пиксельному значению и ТОЛЬКО по
    // onComplete переключаем state `expanded` обратно на false (чтобы не
    // было резкого скачка раньше, чем анимация реально закончится).
    const panelRef = useRef(null);
    const collapsedWidthRef = useRef(null);
    const expandTweenRef = useRef(null);

    const toggleExpand = () => {
        const panel = panelRef.current;
        if (!panel) { setExpanded(v => !v); return; }
        expandTweenRef.current?.kill();

        if (!expanded) {
            // Раскрытие: фиксируем текущую узкую ширину как стартовую
            // точку для будущей обратной анимации, затем растягиваем
            // панель до 100% ширины экрана.
            collapsedWidthRef.current = panel.getBoundingClientRect().width;
            gsap.set(panel, { width: collapsedWidthRef.current });
            setExpanded(true);
            requestAnimationFrame(() => {
                expandTweenRef.current = gsap.to(panel, {
                    width: '100%',
                    duration: 0.5,
                    ease: 'power3.inOut',
                    onComplete: () => { panel.style.width = ''; },
                });
            });
        } else {
            // Сворачивание: сначала плавно уезжаем обратно к прежней
            // (узкой) ширине, и только когда твин реально завершился —
            // переключаем state, чтобы не срезать анимацию раньше времени.
            const target = collapsedWidthRef.current || panel.getBoundingClientRect().width * 0.34;
            expandTweenRef.current = gsap.to(panel, {
                width: target,
                duration: 0.5,
                ease: 'power3.inOut',
                onComplete: () => {
                    panel.style.width = '';
                    setExpanded(false);
                },
            });
        }
    };

    useEffect(() => () => expandTweenRef.current?.kill(), []);

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
    const [draft, setDraft] = useState({ id: null, to: '', subject: '', body: '', attachments: [], replyToId: null });
    const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
    const [accountManageMode, setAccountManageMode] = useState(false);
    const photoInputRef = useRef(null);
    const [mailSearch, setMailSearch] = useState('');
    const touchStartX = useRef(null);

    // 'updates' (обновления платформы) остаётся локальной системной
    // лентой в app-state — почты не касается, не трогаем.
    const rawInbox = state.inbox || {};
    const inbox = {
        updates: rawInbox.updates || [],
        // Локальная корзина хранит ТОЛЬКО удалённые 'update' — реальная
        // почта (входящие/отправленные/черновики) удаляется через
        // бэкенд и живёт в mailData.trash (см. ниже).
        trash: rawInbox.trash || [],
    };
    const reports = state.orchestratorReports || {};
    const readUpdates = state.readUpdateIds || [];
    const starred = state.starredIds || [];

    // ==========================================
    // Реальная почта (Void Mail) — папки на бэкенде + Resend
    // ==========================================
    // Каждая папка (inbox/sent/drafts/trash) хранится в БД на сервере и
    // подгружается лениво — только когда человек реально открыл эту
    // вкладку (незачем тянуть все четыре папки сразу при каждом открытии
    // почты). Список содержит только заголовки/превью (без полного
    // текста письма — дорого гонять по сети при каждом обновлении
    // списка), полный текст подгружается отдельно при открытии письма.
    const [mailData, setMailData] = useState({ inbox: [], sent: [], drafts: [], trash: [] });
    const [mailLoading, setMailLoading] = useState(false);
    const [mailError, setMailError] = useState(null);
    const [mailAddress, setMailAddress] = useState(null);

    // Личный адрес — нужен независимо от того, какая папка открыта
    // (шапка почты, экран составления письма), поэтому грузится один раз
    // при открытии почты, а не по папкам.
    useEffect(() => {
        fetchMailAddress()
            .then(({ address }) => setMailAddress(address))
            .catch(() => { /* не критично — просто не покажем адрес в шапке */ });
    }, []);

    const refreshFolder = async (folderId) => {
        if (!BACKEND_FOLDERS.includes(folderId)) return;
        setMailLoading(true);
        setMailError(null);
        try {
            const { messages } = await fetchFolder(folderId);
            setMailData(prev => ({ ...prev, [folderId]: messages }));
        } catch (e) {
            setMailError(e instanceof ApiError ? e.message : 'Не удалось загрузить письма');
        } finally {
            setMailLoading(false);
        }
    };

    // Загружаем нужные папки при переключении вкладки: обычная папка —
    // саму себя; «Все письма» — сразу «Входящие» и «Отправленные» (то,
    // что в неё попадает). Лёгкий фоновый поллинг (раз в 60с) — чтобы
    // новые письма (в т.ч. пришедшие через вебхук Resend) появлялись без
    // ручного обновления, пока вкладка активна.
    useEffect(() => {
        const targets = activeFolder === 'all' ? ['inbox', 'sent'] : BACKEND_FOLDERS.includes(activeFolder) ? [activeFolder] : [];
        if (targets.length === 0) return;
        targets.forEach(refreshFolder);
        const interval = setInterval(() => targets.forEach(refreshFolder), 60_000);
        return () => clearInterval(interval);
    }, [activeFolder]);

    // Приводим сырые записи бэкенда к единому виду, с которым уже умеет
    // работать остальной UI (LetterRow/LetterReader) — поле `at` в мс,
    // `from`/`title`/`preview` для отображения, плюс сырые адреса
    // (fromAddress/toAddress) для «Ответить» и составления письма.
    const inboxItems = mailData.inbox.map(m => ({
        id: m.id, kind: 'inbox', subject: m.subject, title: m.subject,
        from: m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress,
        fromAddress: m.fromAddress, at: new Date(m.createdAt).getTime(),
        preview: m.preview, isRead: m.isRead,
    }));
    const sentItems = mailData.sent.map(m => ({
        id: m.id, kind: 'sent', subject: m.subject, title: m.subject,
        to: m.toAddress, at: new Date(m.createdAt).getTime(), preview: m.preview,
    }));
    const draftItems = mailData.drafts.map(m => ({
        id: m.id, to: m.toAddress, subject: m.subject, preview: m.preview,
        savedAt: new Date(m.createdAt).getTime(),
    }));
    const trashItems = mailData.trash.map(m => ({
        id: m.id, subject: m.subject, title: m.subject,
        // В корзине уже неизвестно, было письмо входящим или
        // отправленным (папка на бэкенде одна — TRASH), поэтому
        // определяем по наличию адреса отправителя: у отправленных и
        // черновиков fromAddress пуст (это же поле, что и в исходной
        // папке, — просто не было заполнено при создании черновика).
        from: m.fromAddress ? (m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress) : `Кому: ${m.toAddress || '(без адресата)'}`,
        preview: m.preview, deletedAt: new Date(m.createdAt).getTime(),
    }));

    const unreadUpdates = inbox.updates.filter(u => !readUpdates.includes(u.id)).length;
    const unreadInbox = inboxItems.filter(m => !m.isRead).length;
    const pendingReports = Object.values(reports).reduce((n, l) => n + l.filter(r => r.status === 'pending').length, 0);
    const totalUnread = unreadUpdates + unreadInbox + pendingReports;

    const FOLDER_COUNTS = {
        all: totalUnread,
        updates: unreadUpdates,
        agents: pendingReports,
        inbox: unreadInbox,
        sent: 0,
        starred: 0,
        drafts: draftItems.length,
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
    // Входящие/отправленные — показываем письмо сразу с тем, что уже
    // есть (тема/отправитель/дата/превью), полный текст подтягиваем
    // асинхронно — открытие ощущается мгновенным, а не «зависает» на
    // сетевой запрос. Открытие входящего письма на бэкенде автоматически
    // отмечает его прочитанным — обновляем это же и в списке на экране,
    // чтобы точка «непрочитано» пропала сразу, не дожидаясь refreshFolder.
    const openInbox = (m) => {
        setOpenLetter({ id: m.id, kind: 'inbox', title: m.subject, from: m.from, fromAddress: m.fromAddress, subject: m.subject, body: 'Загрузка письма…', at: m.at });
        if (!m.isRead) setMailData(prev => ({ ...prev, inbox: prev.inbox.map(x => x.id === m.id ? { ...x, isRead: true } : x) }));
        fetchMailMessage(m.id)
            .then(({ message }) => {
                if (!message) return;
                setOpenLetter(prev => (prev && prev.id === m.id ? { ...prev, body: message.bodyText || '(пустое письмо)' } : prev));
            })
            .catch((e) => {
                setOpenLetter(prev => (prev && prev.id === m.id ? { ...prev, body: e instanceof ApiError ? `Не удалось загрузить письмо: ${e.message}` : 'Не удалось загрузить письмо' } : prev));
            });
    };
    const openSent = (m) => {
        setOpenLetter({ id: m.id, kind: 'sent', title: m.subject, from: `Кому: ${m.to}`, subject: m.subject, body: 'Загрузка письма…', at: m.at });
        fetchMailMessage(m.id)
            .then(({ message }) => {
                if (!message) return;
                setOpenLetter(prev => (prev && prev.id === m.id ? { ...prev, body: message.bodyText || '(пустое письмо)' } : prev));
            })
            .catch((e) => {
                setOpenLetter(prev => (prev && prev.id === m.id ? { ...prev, body: e instanceof ApiError ? `Не удалось загрузить письмо: ${e.message}` : 'Не удалось загрузить письмо' } : prev));
            });
    };

    // --- Звезда: пока работает только для обновлений (системная лента) —
    // реальная почта звёздочку на бэкенде не хранит (не входило в
    // задачу папок), поэтому в LetterRow/LetterReader кнопка звезды
    // показывается только для kind === 'update'.
    const toggleStar = (id) => {
        updateState({ starredIds: starred.includes(id) ? starred.filter(x => x !== id) : [...starred, id] });
    };

    // --- Удаление 'update' (системные обновления) — как раньше, локально ---
    const deleteToTrash = (kind, item) => {
        const now = Date.now();
        const trashEntry = { ...item, kind, deletedAt: now };
        const nextInbox = { ...inbox, updates: inbox.updates.filter(x => x.id !== item.id), trash: [trashEntry, ...inbox.trash] };
        updateState({ inbox: nextInbox, starredIds: starred.filter(x => x !== item.id) });
        setOpenLetter(null);
    };
    const restoreFromTrash = (item) => {
        const { kind, deletedAt, ...clean } = item;
        const nextInbox = { ...inbox, updates: [clean, ...inbox.updates], trash: inbox.trash.filter(x => x.id !== item.id) };
        updateState({ inbox: nextInbox });
    };
    const purgeFromTrash = (id) => updateState({ inbox: { ...inbox, trash: inbox.trash.filter(x => x.id !== id) } });

    // --- Удаление реальной почты (входящие/отправленные/черновики) —
    // через бэкенд: первый вызов уводит письмо в Корзину, повторный (уже
    // из Корзины) удаляет навсегда — см. MailStoreService.removeOrTrash.
    const deleteMailItem = async (item) => {
        setOpenLetter(null);
        try {
            await deleteMailMessage(item.id);
        } catch (e) {
            setMailError(e instanceof ApiError ? e.message : 'Не удалось удалить письмо');
            return;
        }
        // Оптимистично убираем из текущего списка и обновляем счётчики,
        // не дожидаясь следующего поллинга.
        const sourceKey = item.kind === 'draft' ? 'drafts' : item.kind;
        setMailData(prev => ({ ...prev, [sourceKey]: (prev[sourceKey] || []).filter(x => x.id !== item.id) }));
        if (activeFolder === 'trash') refreshFolder('trash');
    };

    // --- Составление письма ---
    // Для нового письма — сразу открываем пустой композер. Для
    // редактирования черновика — сначала подгружаем ПОЛНЫЙ текст (список
    // черновиков хранит только превью, обрезанное до ~160 символов), а
    // не то короткое превью, что видно в списке.
    const openCompose = (existingDraftSummary, replyTo) => {
        if (replyTo) {
            setDraft({ id: null, to: replyTo.fromAddress || '', subject: replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`, body: '', attachments: [], replyToId: replyTo.id });
            setComposing(true);
            return;
        }
        if (!existingDraftSummary) {
            setDraft({ id: null, to: '', subject: '', body: '', attachments: [], replyToId: null });
            setComposing(true);
            return;
        }
        setDraft({ id: existingDraftSummary.id, to: existingDraftSummary.to, subject: existingDraftSummary.subject, body: 'Загрузка…', attachments: [], replyToId: null });
        setComposing(true);
        fetchMailMessage(existingDraftSummary.id)
            .then(({ message }) => {
                if (!message) return;
                setDraft(prev => (prev.id === existingDraftSummary.id ? { ...prev, body: message.bodyText || '' } : prev));
            })
            .catch(() => setDraft(prev => (prev.id === existingDraftSummary.id ? { ...prev, body: existingDraftSummary.preview || '' } : prev)));
    };
    const hasDraftContent = () => draft.to.trim() || draft.subject.trim() || (draft.body.trim() && draft.body !== 'Загрузка…');

    const saveDraft = async () => {
        if (!hasDraftContent()) return;
        const payload = { to: draft.to, subject: draft.subject, body: draft.body };
        try {
            if (draft.id) {
                await updateDraft(draft.id, payload);
            } else {
                const { draft: created } = await createDraft(payload);
                setDraft(prev => ({ ...prev, id: created.id }));
            }
            if (activeFolder === 'drafts') refreshFolder('drafts');
        } catch (e) {
            setMailError(e instanceof ApiError ? e.message : 'Не удалось сохранить черновик');
        }
    };
    // Закрытие без отправки — автосохранение черновика
    const closeCompose = () => {
        if (hasDraftContent()) saveDraft();
        setComposing(false);
    };
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState(null);
    const sendLetter = async () => {
        if (!draft.to.trim() || !draft.subject.trim() || sending) return;
        setSending(true);
        setSendError(null);
        const to = draft.to.trim();
        const subject = draft.subject.trim();
        const body = draft.body.trim() || '(без текста)';
        try {
            await sendMail(to, subject, body, { replyToId: draft.replyToId || undefined, draftId: draft.id || undefined });
            setDraft({ id: null, to: '', subject: '', body: '', attachments: [], replyToId: null });
            setComposing(false);
            // Письмо переехало из «Черновиков» (если было) в «Отправленные» —
            // обновляем обе папки, если человек сейчас на них смотрит.
            if (activeFolder === 'sent') refreshFolder('sent');
            if (activeFolder === 'drafts') refreshFolder('drafts');
        } catch (e) {
            // Письмо НЕ отмечаем отправленным и не закрываем композер —
            // черновик остаётся на экране, чтобы не потерять текст при
            // сетевой ошибке/лимите/недоступности почтового сервера.
            setSendError(e instanceof ApiError ? e.message : 'Не удалось отправить письмо — проверьте соединение и попробуйте ещё раз');
        } finally {
            setSending(false);
        }
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
        ...inboxItems.map(m => ({ ...m, sortAt: m.at })),
        ...sentItems.map(m => ({ ...m, sortAt: m.at })),
    ].filter(matchesSearch).sort((a, b) => b.sortAt - a.sortAt);

    // Звезда пока хранится только для системных обновлений (см. toggleStar) —
    // почта не участвует в «Помеченных».
    const starredItems = inbox.updates
        .map(u => ({ ...u, kind: 'update' }))
        .filter(x => starred.includes(x.id))
        .filter(matchesSearch)
        .sort((a, b) => b.at - a.at);

    const openByKind = (item) => {
        if (item.kind === 'update') openUpdate(item);
        else if (item.kind === 'inbox') openInbox(item);
        else if (item.kind === 'sent') openSent(item);
    };

    // Удаление письма — маршрутизируется в зависимости от типа: системные
    // обновления удаляются локально (deleteToTrash), реальная почта — через
    // бэкенд (deleteMailItem, см. выше).
    const deleteItem = (item) => {
        if (item.kind === 'update') deleteToTrash('update', item);
        else deleteMailItem(item);
    };

    const LetterReader = ({ letter, onBack }) => (
        <div className="flex flex-col h-full bg-white dark:bg-darkCard">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                <button onClick={onBack} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                <span className="font-bold text-sm dark:text-white truncate flex-1">{letter.title}</span>
                {letter.kind === 'update' && (
                    <button onClick={() => toggleStar(letter.id)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Пометить звёздочкой">
                        <Icons.Star className={`w-4 h-4 ${starred.includes(letter.id) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} style={starred.includes(letter.id) ? { fill: 'currentColor' } : {}} />
                    </button>
                )}
                {letter.kind === 'inbox' && (
                    <button onClick={() => openCompose(null, letter)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#5b32d4] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Ответить">
                        <Icons.Send className="w-3.5 h-3.5" /> Ответить
                    </button>
                )}
                <button onClick={() => deleteItem(letter)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400" title="Удалить">
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
        const unread = item.kind === 'update' ? !readUpdates.includes(item.id) : item.kind === 'inbox' ? !item.isRead : false;
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
                {item.kind === 'update' && (
                    <button onClick={() => toggleStar(item.id)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0" title="Пометить звёздочкой">
                        <Icons.Star className={`w-4 h-4 ${starred.includes(item.id) ? 'text-amber-400' : 'text-gray-300'}`} style={starred.includes(item.id) ? { fill: 'currentColor' } : {}} />
                    </button>
                )}
                <button onClick={() => deleteItem(item)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" title="Удалить">
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
        if (activeFolder === 'inbox') {
            return (
                <>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-gray-900/20">
                        <div className="flex items-center gap-2">
                            <button onClick={() => toggleNotify('notifyPersonal')} className={`relative w-11 h-6 rounded-full transition-colors ${state.notifyPersonal !== false ? 'bg-[#5b32d4]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${state.notifyPersonal !== false ? 'translate-x-5' : ''}`} />
                            </button>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Уведомления</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => refreshFolder('inbox')} disabled={mailLoading} title="Обновить" className="p-2 rounded-lg text-gray-400 hover:text-[#5b32d4] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-40">
                                <Icons.RefreshCw className={`w-4 h-4 ${mailLoading ? 'animate-spin' : ''}`} />
                            </button>
                            <button onClick={() => openCompose(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5b32d4] hover:bg-[#4a26b0] text-white text-xs font-bold transition-colors">
                                <Icons.Plus className="w-4 h-4" /> Написать
                            </button>
                        </div>
                    </div>
                    {mailAddress && <p className="px-5 py-2 text-[11px] text-gray-400 border-b border-gray-100 dark:border-darkBorder">Ящик: {mailAddress}</p>}
                    {mailError && <p className="px-5 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10">{mailError}</p>}
                    {mailLoading && inboxItems.length === 0
                        ? <EmptyState icon={Icons.Mail} text="Загружаем письма…" />
                        : (inboxItems.length === 0 ? <EmptyState icon={Icons.Mail} text="Писем нет" /> : <div className="py-1">{inboxItems.map(m => <LetterRow key={m.id} item={m} />)}</div>)}
                </>
            );
        }
        if (activeFolder === 'sent') {
            return (
                <>
                    <div className="flex items-center justify-end px-5 py-2 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-gray-900/20">
                        <button onClick={() => refreshFolder('sent')} disabled={mailLoading} title="Обновить" className="p-2 rounded-lg text-gray-400 hover:text-[#5b32d4] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-40">
                            <Icons.RefreshCw className={`w-4 h-4 ${mailLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    {sentItems.length === 0 ? <EmptyState icon={Icons.Send} text="Отправленных писем нет" /> : <div className="py-1">{sentItems.map(m => <LetterRow key={m.id} item={m} />)}</div>}
                </>
            );
        }
        if (activeFolder === 'starred') {
            return starredItems.length === 0 ? <EmptyState icon={Icons.Star} text="Помеченных писем нет" /> : <div className="py-1">{starredItems.map(item => <LetterRow key={item.id} item={item} />)}</div>;
        }
        if (activeFolder === 'drafts') {
            return (
                <>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-darkBorder bg-gray-50/50 dark:bg-gray-900/20">
                        <button onClick={() => refreshFolder('drafts')} disabled={mailLoading} title="Обновить" className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-[#5b32d4] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-40">
                            <Icons.RefreshCw className={`w-4 h-4 ${mailLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={() => openCompose(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5b32d4] hover:bg-[#4a26b0] text-white text-xs font-bold transition-colors">
                            <Icons.Plus className="w-4 h-4" /> Написать
                        </button>
                    </div>
                    {draftItems.length === 0 ? <EmptyState icon={Icons.Pencil} text="Черновиков нет" /> : (
                        <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                            {draftItems.map(d => (
                                <div key={d.id} className="flex items-center gap-2 px-2">
                                    <button onClick={() => openCompose(d)} className="flex-1 min-w-0 text-left px-3 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-xl transition-colors">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-bold text-sm dark:text-white truncate">{d.to || 'Без адресата'}</p>
                                            <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(d.savedAt)}</span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{d.subject || '(без темы)'}</p>
                                    </button>
                                    <button onClick={() => deleteMailItem({ id: d.id, kind: 'draft' })} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 shrink-0"><Icons.Trash className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            );
        }
        if (activeFolder === 'trash') {
            // Корзина показывает ДВА независимых источника: локально
            // удалённые системные обновления (можно восстановить — они
            // никогда не покидали браузер) и реальную почту, удалённую
            // через бэкенд (восстановление недоступно — папка на
            // сервере одна общая "TRASH", исходная папка не хранится;
            // повторное удаление стирает письмо навсегда).
            const localTrash = inbox.trash;
            const hasAny = localTrash.length > 0 || trashItems.length > 0;
            return !hasAny ? <EmptyState icon={Icons.Trash} text="Корзина пуста" /> : (
                <div className="divide-y divide-gray-50 dark:divide-darkBorder">
                    {localTrash.map(item => {
                        const title = item.title;
                        const from = 'Void Code AI';
                        return (
                            <div key={`local_${item.id}`} className="flex items-center gap-2 px-2">
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
                    {trashItems.map(item => (
                        <div key={`mail_${item.id}`} className="flex items-center gap-2 px-2">
                            <div className="flex-1 min-w-0 px-3 py-3.5">
                                <p className="font-bold text-sm dark:text-white truncate">{item.from}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.title || '(без темы)'}</p>
                                <p className="text-[11px] text-gray-400">Удалено {fmtTime(item.deletedAt)}</p>
                            </div>
                            <button onClick={() => deleteMailItem({ id: item.id, kind: 'trash' })} title="Удалить навсегда" className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 shrink-0"><Icons.X className="w-4 h-4" /></button>
                        </div>
                    ))}
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
                ref={panelRef}
                className={`relative bg-white dark:bg-darkCard shadow-2xl flex flex-col slide-in-right h-full ${expanded ? 'w-full' : 'w-full sm:w-[420px] md:w-[34vw] md:max-w-[560px]'}`}
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
                        <button onClick={toggleExpand} className="hidden sm:flex p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400" title={expanded ? 'Свернуть' : 'На весь экран'}>
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
                            <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0 flex flex-col gap-2">
                                {sendError && <p className="text-xs text-red-500 px-1">{sendError}</p>}
                                <div className="flex gap-2">
                                    <button onClick={saveDraft} className="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm transition-colors">Сохранить</button>
                                    <button onClick={sendLetter} disabled={!draft.to.trim() || !draft.subject.trim() || sending} className="flex-1 py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors">{sending ? 'Отправка…' : 'Отправить'}</button>
                                </div>
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

function EmptyState({ icon: IconC, text }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-8 py-16 text-gray-300 dark:text-gray-600">
            <IconC className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">{text}</p>
        </div>
    );
}
