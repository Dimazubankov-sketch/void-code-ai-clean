import { useState } from 'react';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { useLongPressMenu } from '@/shared/lib/useLongPressMenu';
import { RenameChatModal, DeleteChatModal, AddToProjectModal } from '@/features/chat/ChatActionModals';
import { ChatActionsMenu } from '@/features/chat/ChatActionsMenu';
import { buildShareLink, dialogToText } from '@/shared/lib/shareDialog';

// Ищет по всем чатам сообщения, содержащие ключевое слово, и возвращает
// короткий фрагмент текста вокруг найденного места (как в поиске Ctrl+F).
const buildSnippet = (text, query) => {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 80);
    const start = Math.max(0, idx - 30);
    const end = Math.min(text.length, idx + query.length + 50);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
};

const searchChatHistory = (chatSessions, query) => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const results = [];
    chatSessions.forEach(chat => {
        // Заголовок чата тоже участвует в поиске
        if (chat.title && chat.title.toLowerCase().includes(q)) {
            results.push({ chatId: chat.id, chatTitle: chat.title, msgIdx: 0, snippet: chat.title });
        }
        (chat.messages || []).forEach((msg, idx) => {
            if (msg.content && msg.content.toLowerCase().includes(q)) {
                results.push({
                    chatId: chat.id,
                    chatTitle: chat.title,
                    msgIdx: idx,
                    snippet: buildSnippet(msg.content, query),
                });
            }
        });
    });
    return results.slice(0, 40);
};

// Сортировка списка чатов: закреплённые сверху (свежезакреплённые выше —
// по убыванию pinnedAt), затем остальные в исходном порядке.
const sortChats = (chats) => {
    const pinned = chats.filter(c => c.pinnedAt).sort((a, b) => b.pinnedAt - a.pinnedAt);
    const rest = chats.filter(c => !c.pinnedAt);
    return { pinned, rest };
};

// ==========================================
// БОКОВОЕ МЕНЮ (ШТОРКА)
// ==========================================
export function RightMenu({ state, updateState }) {
    const lang = state.lang || 'ru';
    const [chatAction, setChatAction] = useState(null); // {type, chat}
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    if (!state.user) return null;

    const searchResults = searchChatHistory(state.chatSessions, searchQuery);
    const openSearchResult = (result) => {
        updateState({
            activeChatId: result.chatId,
            currentView: 'chat',
            isRightMenuOpen: false,
            imageGenMode: false,
            scrollToMessageIdx: result.msgIdx,
            scrollToMessageChatId: result.chatId,
        });
        setSearchQuery('');
        setSearchOpen(false);
    };

    const togglePin = (chat) => {
        updateState({
            chatSessions: state.chatSessions.map(c =>
                c.id === chat.id ? { ...c, pinnedAt: c.pinnedAt ? null : Date.now() } : c),
        });
    };

    const deleteChat = (chat) => {
        if (!window.confirm(t(lang, 'menu.deleteChatConfirm', { title: chat.title }))) return;
        const remaining = state.chatSessions.filter(c => c.id !== chat.id);
        if (remaining.length === 0) {
            const nid = Date.now();
            updateState({ chatSessions: [{ id: nid, title: t(lang, 'menu.newChat'), messages: [] }], activeChatId: nid });
        } else if (state.activeChatId === chat.id) {
            updateState({ chatSessions: remaining, activeChatId: remaining[0].id });
        } else {
            updateState({ chatSessions: remaining });
        }
    };

    // Пустые чаты (без единого сообщения) не должны засорять историю —
    // раньше при каждом клике «Новый чат» в списке появлялась пустая
    // безымянная запись, даже если пользователь так и не написал первое
    // сообщение и ушёл в другой раздел. ИСКЛЮЧЕНИЕ: если пустой чат сейчас
    // АКТИВНЫЙ (activeChatId), его всё равно показываем — иначе только что
    // созданный чат мгновенно исчезает из списка на глазах у пользователя,
    // хотя он всё ещё находится внутри него.
    const visibleChats = state.chatSessions.filter(c => (c.messages && c.messages.length > 0) || c.id === state.activeChatId);
    const { pinned, rest } = sortChats(visibleChats);

    // Строка чата в списке (используется и для закреплённых, и для недавних)
    // ChatRow с long-press меню (задача 12). Кнопки закрепить/удалить
    // убраны — теперь зажатие открывает мини-меню (ChatActionsMenu) с
    // теми же действиями + Поделиться/Переименовать/В проект. Хук
    // useLongPressMenu уже используется в UserMessageBubble для похожего
    // сценария на сообщениях.
    const ChatRow = ({ chat }) => {
        const { bind, menuOpen, setMenuOpen } = useLongPressMenu(400);
        const alreadyPinned = !!chat.pinnedAt;

        const handleAction = (action) => {
            setMenuOpen(false);
            switch (action) {
                case 'share': {
                    const { url, tooLong } = buildShareLink(chat);
                    if (!tooLong && navigator.share) {
                        try { navigator.share({ title: chat.title, url }); } catch { /* noop */ }
                    } else {
                        try {
                            navigator.clipboard.writeText(tooLong ? dialogToText(chat) : url);
                        } catch { /* noop */ }
                    }
                    break;
                }
                case 'pin':
                    togglePin(chat);
                    break;
                case 'rename':
                    setChatAction({ type: 'rename', chat });
                    break;
                case 'moveToProj':
                    setChatAction({ type: 'project', chat });
                    break;
                case 'delete':
                    setChatAction({ type: 'delete', chat });
                    break;
                default:
                    break;
            }
        };

        return (
            <div className="relative">
                <div
                    {...bind}
                    // ВАЖНО (баг-фикс задачи 2): раньше кликабельная область
                    // строки была настоящим <button>, а bind (обработчики
                    // long-press) висел на родительском <div>. useLongPressMenu
                    // намеренно игнорирует touchstart/mousedown, если
                    // e.target.closest('button') находит button — это защита
                    // от того, чтобы зажатие не перехватывало нажатия на
                    // ДРУГИЕ кнопки внутри строки. Но здесь сама кликабельная
                    // область И БЫЛА этим button на всю строку — в итоге
                    // e.target ВСЕГДА попадал внутрь button, защита срабатывала
                    // всегда, и таймер long-press не запускался НИКОГДА на
                    // touch-устройствах (на ПК спасал отдельный путь через
                    // правый клик — oncontextmenu не проверяет target).
                    // Теперь это div с role="button" — визуально и по
                    // доступности ведёт себя как кнопка (клик, Enter/Space),
                    // но не является настоящим <button>, поэтому больше не
                    // блокирует long-press.
                    role="button"
                    tabIndex={0}
                    onClick={() => updateState({ activeChatId: chat.id, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false })}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            updateState({ activeChatId: chat.id, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false });
                        }
                    }}
                    className={`group w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors cursor-pointer ${state.activeChatId === chat.id ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'} touch-manipulation`}
                    style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                >
                    {chat.pinnedAt ? <Icons.PinFilled className="w-4 h-4 flex-shrink-0 text-[#5b32d4]" /> : <Icons.MessageSquare className="w-5 h-5 flex-shrink-0" />}
                    <span className="font-semibold text-[15px] truncate">{chat.title}</span>
                </div>
                <ChatActionsMenu
                    open={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    onAction={handleAction}
                    alreadyPinned={alreadyPinned}
                    position="inline"
                />
            </div>
        );
    };

    // Кнопка навигации меню: белый фон, без постоянной обводки; серая обводка
    // появляется при наведении/нажатии. Отступы плотные.
    const NavButton = ({ icon: Icon, label, onClick, primary = false, right = null }) => (
        <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-colors border ${primary
            ? 'bg-[#5b32d4] hover:bg-[#4a26b0] text-white border-transparent shadow-md'
            : 'bg-white dark:bg-darkCard text-gray-800 dark:text-gray-200 border-transparent hover:border-gray-200 dark:hover:border-gray-700 active:border-gray-300'}`}>
            <Icon className="w-5 h-5 flex-shrink-0" /> {label}
            {right && <span className="ml-auto flex items-center">{right}</span>}
        </button>
    );

    return (
        <>
            <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${state.isRightMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => updateState({ isRightMenuOpen: false })} />
            <div className={`fixed top-0 right-0 h-full w-[85vw] md:w-96 bg-white dark:bg-darkCard shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${state.isRightMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6 flex-1 min-h-0 flex flex-col relative overflow-hidden">
                    {/* Шапка: слева лупа, «Меню» по центру, справа крестик */}
                    <div className="flex items-center mb-6 mt-2 shrink-0 relative h-8">
                        <button onClick={() => setSearchOpen(true)} className="void-tap-target absolute left-0 p-2 -ml-2 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors" title={t(lang, 'menu.search')}>
                            <Icons.Search className="w-6 h-6" />
                        </button>
                        <span className="font-extrabold text-xl dark:text-white mx-auto">{t(lang, 'menu.title')}</span>
                        <button
                            onClick={() => updateState({ isRightMenuOpen: false })}
                            title="Закрыть меню"
                            // Задача 10: раньше у кнопки не было flex-центрирования
                            // иконки внутри хитбокса (только padding), из-за чего
                            // сама иконка X сидела не по центру кликабельной
                            // области — и нативная обводка фокуса браузера
                            // визуально «съезжала» вправо относительно иконки.
                            // Явный w-9 h-9 + flex items-center justify-center
                            // центрируют иконку РОВНО по центру обводки. Обводка
                            // теперь появляется только в момент нажатия
                            // (active:ring-2), в покое (focus:outline-none) —
                            // невидима.
                            className="void-tap-target absolute right-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors focus:outline-none active:ring-2 active:ring-gray-300 dark:active:ring-gray-600"
                        >
                            <Icons.X />
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-24 -mx-1 px-1">
                        <div className="space-y-1 mb-4">
                            <NavButton primary icon={Icons.Plus} label={t(lang, 'menu.createChat')} onClick={() => {
                                const nid = Date.now();
                                updateState({ chatSessions: [{ id: nid, title: t(lang, 'menu.newChat'), messages: [] }, ...state.chatSessions], activeChatId: nid, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false });
                            }} />
                            <NavButton icon={Icons.Folder} label={t(lang, 'menu.projects')} onClick={() => updateState({ currentView: 'projects', isRightMenuOpen: false })} />
                            <NavButton icon={Icons.Skills} label={t(lang, 'menu.skills')} onClick={() => updateState({ currentView: 'skills', isRightMenuOpen: false })} />
                            <NavButton icon={Icons.Plug} label={t(lang, 'menu.plugins')} onClick={() => updateState({ currentView: 'plugins', isRightMenuOpen: false })} />
                            <NavButton icon={Icons.Library} label={t(lang, 'menu.library')} onClick={() => updateState({ currentView: 'library', isRightMenuOpen: false })} />
                            {/* Агенты (Cockpit) — раньше была отдельной плиткой на
                                Хабе, теперь живёт здесь, под «Библиотекой». Та же
                                иконка-робот, та же логика перехода: currentView
                                становится 'agent-store' — попадаем ровно туда же,
                                куда вела плитка в хабе. */}
                            <NavButton icon={Icons.Robot} label="Агенты" onClick={() => updateState({ currentView: 'agent-store', isRightMenuOpen: false })} />
                            {/* Почта вынесена сюда из шапки чата: там она
                                занимала постоянное место ради нечастого
                                действия. Показываем счётчик непрочитанного,
                                чтобы вынос в меню не «спрятал» новые письма. */}
                            <NavButton icon={Icons.MailLogo} label="Почта" onClick={() => updateState({ showNotifications: true, isRightMenuOpen: false })} right={
                                (Object.values(state.orchestratorReports || {}).some(list => list.some(r => r.status === 'pending'))
                                  || (state.inbox?.updates || []).some(u => !(state.readUpdateIds || []).includes(u.id))
                                  || (state.inbox?.personal || []).some(m => !(state.readPersonalIds || []).includes(m.id)))
                                    ? <span className="w-2 h-2 rounded-full bg-red-500" />
                                    : null
                            } />
                        </div>

                        {/* Серый разделитель «Недавние» между кнопками меню и чатами */}
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-2 mt-2">{t(lang, 'menu.recents')}</h3>

                        <div className="space-y-0.5">
                            {pinned.map(chat => <ChatRow key={chat.id} chat={chat} />)}
                            {pinned.length > 0 && rest.length > 0 && <div className="h-px bg-gray-100 dark:bg-gray-800 my-2 mx-2" />}
                            {rest.map(chat => <ChatRow key={chat.id} chat={chat} />)}
                        </div>
                    </div>

                    {/* Кнопка настроек — зафиксирована снизу поверх прокрутки */}
                    <div className="absolute bottom-6 left-6">
                        <button onClick={() => updateState({ currentView: 'settings', isRightMenuOpen: false })} className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-sm text-gray-700 dark:text-gray-300">
                            <Icons.Settings className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Поиск: на мобильном — полноэкранный, на десктопе — попвер поверх меню */}
            {searchOpen && (
                <ChatSearchOverlay
                    lang={lang}
                    query={searchQuery}
                    setQuery={setSearchQuery}
                    results={searchResults}
                    onPick={openSearchResult}
                    onClose={() => { setSearchOpen(false); setSearchQuery(''); }}
                />
            )}
            {chatAction?.type === 'rename' && (
                <RenameChatModal
                    chat={chatAction.chat}
                    onClose={() => setChatAction(null)}
                    onSave={(title) => updateState({
                        chatSessions: state.chatSessions.map(c => c.id === chatAction.chat.id ? { ...c, title } : c),
                    })}
                />
            )}
            {chatAction?.type === 'delete' && (
                <DeleteChatModal
                    chat={chatAction.chat}
                    onClose={() => setChatAction(null)}
                    onConfirm={() => deleteChat(chatAction.chat)}
                />
            )}
            {chatAction?.type === 'project' && (
                <AddToProjectModal
                    chat={chatAction.chat}
                    projects={state.projects || []}
                    onClose={() => setChatAction(null)}
                    onPick={(projectId) => updateState({
                        chatSessions: state.chatSessions.map(c => c.id === chatAction.chat.id ? { ...c, projectId } : c),
                    })}
                    onCreate={(name) => {
                        const id = 'proj' + Date.now();
                        updateState({
                            projects: [{ id, name, createdAt: Date.now() }, ...(state.projects || [])],
                            chatSessions: state.chatSessions.map(c => c.id === chatAction.chat.id ? { ...c, projectId: id } : c),
                        });
                    }}
                />
            )}
        </>

    );
}

// Оверлей поиска: fullscreen на мобильном, аккуратный попвер на десктопе.
function ChatSearchOverlay({ lang, query, setQuery, results, onPick, onClose }) {
    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative mt-0 sm:mt-24 w-full sm:w-[520px] h-full sm:h-auto sm:max-h-[70vh] bg-white dark:bg-darkCard sm:rounded-3xl shadow-2xl flex flex-col slide-in-up sm:fade-in overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 p-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <Icons.Search className="w-5 h-5 text-gray-400 shrink-0" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t(lang, 'menu.searchPlaceholder')}
                        className="flex-1 bg-transparent outline-none text-[15px] dark:text-white"
                    />
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><Icons.X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {query.trim() === '' ? (
                        <p className="text-sm text-gray-400 text-center py-10">{t(lang, 'menu.searchPlaceholder')}</p>
                    ) : results.length > 0 ? results.map((r, i) => (
                        <button key={i} onClick={() => onPick(r)} className="w-full text-left p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <p className="font-semibold text-sm dark:text-white truncate">{r.chatTitle}</p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{r.snippet}</p>
                        </button>
                    )) : (
                        <p className="text-sm text-gray-400 text-center py-10">{t(lang, 'menu.nothingFound')}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
