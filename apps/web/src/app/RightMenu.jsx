import { useState } from 'react';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';


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
    return results.slice(0, 30); // не даём списку разрастись бесконечно
};

// ==========================================
// БОКОВОЕ МЕНЮ (ШТОРКА)
// ==========================================
export function RightMenu({ state, updateState }) {
    const lang = state.lang || 'ru';
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
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${state.isRightMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => updateState({isRightMenuOpen: false})} />
            <div className={`fixed top-0 right-0 h-full w-[85vw] md:w-96 bg-white dark:bg-darkCard shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${state.isRightMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6 flex-1 min-h-0 flex flex-col relative overflow-hidden">
                    <button onClick={() => updateState({isRightMenuOpen: false})} className="void-tap-target absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center z-10"><Icons.X /></button>

                    <div className="flex items-center gap-3 mb-6 mt-2 shrink-0">
                        <span className="font-extrabold text-xl dark:text-white">{t(lang, 'menu.title')}</span>
                    </div>

                    {/* Единый прокручиваемый блок: навигация + поиск + история —
                        всё меню листается целиком, а не только история чатов. */}
                    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-24 -mx-1 px-1">
                        <div className="space-y-3 mb-6">
                            <button onClick={() => { 
                                const nid = Date.now(); 
                                updateState({chatSessions: [{id:nid,title:t(lang, 'menu.newChat'),messages:[]}, ...state.chatSessions], activeChatId: nid, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false}); 
                            }} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors shadow-md">
                                <Icons.Plus /> {t(lang, 'menu.createChat')}
                            </button>
                            <button onClick={() => {
                                const nid = Date.now();
                                updateState({chatSessions: [{id:nid,title:t(lang, 'menu.newImage'),messages:[]}, ...state.chatSessions], activeChatId: nid, currentView: 'chat', isRightMenuOpen: false, imageGenMode: true});
                            }} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                                <Icons.Image /> {t(lang, 'menu.createImage')}
                            </button>
                            <button onClick={() => updateState({currentView: 'projects', isRightMenuOpen: false})} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                                <Icons.Folder /> {t(lang, 'menu.projects')}
                            </button>
                            <button onClick={() => updateState({currentView: 'plugins', isRightMenuOpen: false})} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                                <Icons.Plug /> {t(lang, 'menu.plugins')}
                            </button>
                            <button onClick={() => updateState({currentView: 'library', isRightMenuOpen: false})} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                                <Icons.Library /> {t(lang, 'menu.library')}
                            </button>
                        </div>

                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 ml-1">{t(lang, 'menu.chatHistory')}</h3>
                        <div className="relative mb-3">
                            <Icons.Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Поиск по истории чатов…"
                                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-xl text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-all"
                            />
                        </div>
                        <div className="space-y-1">
                            {searchQuery.trim() ? (
                                searchResults.length > 0 ? searchResults.map((result, i) => (
                                    <button key={i} onClick={() => openSearchResult(result)} className="w-full text-left p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                        <p className="font-semibold text-sm dark:text-white truncate">{result.chatTitle}</p>
                                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{result.snippet}</p>
                                    </button>
                                )) : (
                                    <p className="text-sm text-gray-400 text-center py-6">Ничего не найдено</p>
                                )
                            ) : state.chatSessions.map(chat => (
                                <div key={chat.id} className={`group w-full flex items-center gap-2 p-1 rounded-xl transition-colors ${state.activeChatId === chat.id ? 'bg-[#efecf9] dark:bg-purple-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                    <button onClick={() => updateState({activeChatId: chat.id, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false})} className={`flex-1 min-w-0 flex items-center gap-3 p-2 rounded-lg text-left ${state.activeChatId === chat.id ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                        <Icons.MessageSquare className="w-5 h-5 flex-shrink-0" /><span className="font-semibold text-[15px] truncate">{chat.title}</span>
                                    </button>
                                    <button onClick={() => {
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
                                    }} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title={t(lang, 'menu.deleteChat')}>
                                        <Icons.Trash className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Кнопка настроек — зафиксирована снизу поверх прокрутки */}
                    <div className="absolute bottom-6 left-6">
                        <button onClick={() => updateState({currentView: 'settings', isRightMenuOpen: false})} className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-sm text-gray-700 dark:text-gray-300">
                            <Icons.Settings className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
