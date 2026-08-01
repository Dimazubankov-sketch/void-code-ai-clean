import { useState } from 'react';
import { goBack } from '@/shared/lib/navigation';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ПРОЕКТЫ — объединение чатов с ЕДИНЫМ контекстом
// ==========================================
// Полноэкранный вид: сверху — поиск проектов по названию, снизу — кнопка «+»
// для создания нового проекта. Внутри проекта чаты объединяются: ИИ при
// ответе в любом из них видит историю ВСЕХ чатов проекта (общая память).
// Сама склейка контекста живёт в App.jsx → handleSendMessage.

export function ProjectsView({ state, updateState }) {
    const lang = state.lang || 'ru';
    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [openProjectId, setOpenProjectId] = useState(null);

    const projects = state.projects || [];
    const chats = state.chatSessions || [];
    const visible = projects.filter(p => query.trim() === '' || p.name.toLowerCase().includes(query.trim().toLowerCase()));
    const openProject = projects.find(p => p.id === openProjectId);

    const createProject = () => {
        const name = newName.trim();
        if (!name) return;
        const project = { id: 'proj_' + Date.now(), name, chatIds: [], createdAt: Date.now() };
        updateState({ projects: [project, ...projects] });
        setNewName('');
        setCreating(false);
        setOpenProjectId(project.id);
    };

    const deleteProject = (id) => {
        if (!window.confirm(t(lang, 'projects.confirmDelete'))) return;
        updateState({ projects: projects.filter(p => p.id !== id) });
        if (openProjectId === id) setOpenProjectId(null);
    };

    const toggleChatInProject = (projectId, chatId) => {
        updateState({
            projects: projects.map(p => {
                if (p.id !== projectId) return p;
                const inProject = (p.chatIds || []).includes(chatId);
                return { ...p, chatIds: inProject ? p.chatIds.filter(c => c !== chatId) : [...(p.chatIds || []), chatId] };
            }),
        });
    };

    const openChat = (chatId) => {
        updateState({ activeChatId: chatId, currentView: 'chat', imageGenMode: false });
    };

    const newChatInProject = (project) => {
        const nid = Date.now();
        updateState({
            chatSessions: [{ id: nid, title: t(lang, 'menu.newChat'), messages: [] }, ...chats],
            activeChatId: nid,
            currentView: 'chat',
            imageGenMode: false,
            projects: projects.map(p => p.id === project.id ? { ...p, chatIds: [...(p.chatIds || []), nid] } : p),
        });
    };

    // --- Внутренний экран одного проекта ---
    if (openProject) {
        const projectChats = chats.filter(c => (openProject.chatIds || []).includes(c.id));
        const otherChats = chats.filter(c => !(openProject.chatIds || []).includes(c.id));
        return (
            <div className="flex-1 flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
                <div className="max-w-2xl mx-auto px-4 py-8 md:py-12 w-full flex-1 overflow-y-auto pb-8">
                    <div className="flex items-center mb-2 gap-4">
                        <button onClick={() => setOpenProjectId(null)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                        <div className="w-10 h-10 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center shrink-0"><Icons.Folder className="w-5 h-5" /></div>
                        <h2 className="text-2xl font-extrabold dark:text-white flex-1 min-w-0 truncate">{openProject.name}</h2>
                        <button onClick={() => deleteProject(openProject.id)} className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t(lang, 'projects.delete')}><Icons.Trash className="w-5 h-5" /></button>
                    </div>
                    <p className="text-sm text-gray-400 mb-6 ml-1">{t(lang, 'projects.sharedContextHint')}</p>

                    <button onClick={() => newChatInProject(openProject)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors shadow-md mb-6">
                        <Icons.Plus /> {t(lang, 'projects.newChatInProject')}
                    </button>

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">{t(lang, 'projects.chatsInProject')} · {projectChats.length}</h3>
                    {projectChats.length === 0 ? (
                        <p className="text-sm text-gray-400 mb-6 ml-1">{t(lang, 'projects.noChatsYet')}</p>
                    ) : (
                        <div className="space-y-2 mb-8">
                            {projectChats.map(chat => (
                                <div key={chat.id} className="group flex items-center gap-2 bg-white dark:bg-darkCard p-2 rounded-2xl border border-gray-100 dark:border-darkBorder">
                                    <button onClick={() => openChat(chat.id)} className="flex-1 min-w-0 flex items-center gap-3 p-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                        <Icons.MessageSquare className="w-5 h-5 flex-shrink-0 text-[#5b32d4] dark:text-purple-400" />
                                        <span className="font-semibold text-[15px] truncate dark:text-white">{chat.title}</span>
                                    </button>
                                    <button onClick={() => toggleChatInProject(openProject.id, chat.id)} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title={t(lang, 'projects.removeFromProject')}>
                                        <Icons.X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">{t(lang, 'projects.addExistingChats')}</h3>
                    {otherChats.length === 0 ? (
                        <p className="text-sm text-gray-400 ml-1">{t(lang, 'projects.noOtherChats')}</p>
                    ) : (
                        <div className="space-y-2">
                            {otherChats.map(chat => (
                                <button key={chat.id} onClick={() => toggleChatInProject(openProject.id, chat.id)} className="w-full flex items-center gap-3 bg-white dark:bg-darkCard p-4 rounded-2xl border border-gray-100 dark:border-darkBorder hover:border-[#5b32d4]/40 transition-all text-left">
                                    <Icons.MessageSquare className="w-5 h-5 flex-shrink-0 text-gray-400" />
                                    <span className="font-semibold text-[15px] truncate flex-1 min-w-0 dark:text-white">{chat.title}</span>
                                    <span className="flex items-center gap-1 text-xs font-bold text-[#5b32d4] dark:text-purple-400 shrink-0"><Icons.Plus className="w-4 h-4" /> {t(lang, 'projects.add')}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- Список проектов ---
    return (
        <div className="flex-1 flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full relative">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12 w-full flex-1 overflow-y-auto pb-28">
                <div className="flex items-center mb-6 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">{t(lang, 'projects.title')}</h2>
                </div>

                {/* Поиск проектов по названию — в верхней части */}
                <div className="relative mb-6">
                    <Icons.Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t(lang, 'projects.searchPlaceholder')}
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-[15px] dark:text-white outline-none focus:border-[#5b32d4] focus:ring-4 focus:ring-[#5b32d4]/10 transition-all shadow-sm"
                    />
                </div>

                {visible.length === 0 ? (
                    <div className="text-center text-gray-400 py-20">
                        <Icons.Folder className="w-14 h-14 mx-auto mb-4 text-gray-300" />
                        <p className="text-sm font-medium mb-1">{projects.length === 0 ? t(lang, 'projects.emptyTitle') : t(lang, 'projects.notFound')}</p>
                        {projects.length === 0 && <p className="text-xs">{t(lang, 'projects.emptyHint')}</p>}
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {visible.map(p => (
                            <button key={p.id} onClick={() => setOpenProjectId(p.id)} className="w-full flex items-center gap-3 bg-white dark:bg-darkCard p-4 rounded-2xl border border-gray-100 dark:border-darkBorder hover:border-[#5b32d4]/40 hover:shadow-sm transition-all text-left">
                                <div className="w-11 h-11 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center shrink-0"><Icons.Folder className="w-5 h-5" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-sm dark:text-white truncate">{p.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{t(lang, 'projects.chatsCount')}: {(p.chatIds || []).length}</p>
                                </div>
                                <Icons.ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Кнопка «+» создания нового проекта — в нижней части */}
            <button
                onClick={() => setCreating(true)}
                title={t(lang, 'projects.create')}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-16 h-16 rounded-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white flex items-center justify-center shadow-2xl transition-all hover:scale-105"
            >
                <Icons.Plus className="w-8 h-8" />
            </button>

            {/* Модалка создания проекта с вводом названия */}
            {creating && (
                <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={() => setCreating(false)}>
                    <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Folder className="w-5 h-5" /></div>
                            <h4 className="font-extrabold text-lg dark:text-white">{t(lang, 'projects.newProject')}</h4>
                            <button onClick={() => setCreating(false)} className="ml-auto p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">{t(lang, 'projects.newProjectHint')}</p>
                        <input
                            autoFocus
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setCreating(false); }}
                            placeholder={t(lang, 'projects.namePlaceholder')}
                            className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-darkBorder text-[15px] dark:text-white outline-none focus:border-[#5b32d4] transition-colors mb-4"
                        />
                        <button onClick={createProject} disabled={!newName.trim()} className="w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-bold transition-colors">
                            {t(lang, 'projects.create')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
