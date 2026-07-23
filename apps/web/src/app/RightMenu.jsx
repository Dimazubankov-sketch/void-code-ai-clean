import { Icons } from '@/shared/ui/Icons';


// ==========================================
// БОКОВОЕ МЕНЮ (ШТОРКА)
// ==========================================
export function RightMenu({ state, updateState }) {
    if (!state.user) return null;

    return (
        <>
            <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${state.isRightMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => updateState({isRightMenuOpen: false})} />
            <div className={`fixed top-0 right-0 h-full w-[85vw] md:w-96 bg-white dark:bg-darkCard shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${state.isRightMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6 flex-1 flex flex-col relative overflow-hidden">
                    <button onClick={() => updateState({isRightMenuOpen: false})} className="void-tap-target absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>
                    
                    <div className="flex items-center gap-3 mb-8 mt-2">
                        <span className="font-extrabold text-xl dark:text-white">Меню</span>
                    </div>

                    <div className="space-y-3 mb-6">
                        <button onClick={() => { 
                            const nid = Date.now(); 
                            updateState({chatSessions: [{id:nid,title:'Новый чат',messages:[]}, ...state.chatSessions], activeChatId: nid, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false}); 
                        }} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors shadow-md">
                            <Icons.Plus /> Создать новый чат
                        </button>
                        <button onClick={() => {
                            const nid = Date.now();
                            updateState({chatSessions: [{id:nid,title:'Новое изображение',messages:[]}, ...state.chatSessions], activeChatId: nid, currentView: 'chat', isRightMenuOpen: false, imageGenMode: true});
                        }} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                            <Icons.Image /> Создать изображение
                        </button>
                        <button onClick={() => updateState({currentView: 'sys-prompt', isRightMenuOpen: false})} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                            <Icons.LayoutDashboard /> Системный промт
                        </button>
                        <button onClick={() => updateState({currentView: 'library', isRightMenuOpen: false})} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold transition-colors border border-gray-100 dark:border-darkBorder">
                            <Icons.Library /> Библиотека
                        </button>
                    </div>

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 ml-1">История чатов</h3>
                    <div className="flex-1 overflow-y-auto space-y-1 pb-20 scrollbar-hide">
                        {state.chatSessions.map(chat => (
                            <div key={chat.id} className={`group w-full flex items-center gap-2 p-1 rounded-xl transition-colors ${state.activeChatId === chat.id ? 'bg-[#efecf9] dark:bg-purple-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                <button onClick={() => updateState({activeChatId: chat.id, currentView: 'chat', isRightMenuOpen: false, imageGenMode: false})} className={`flex-1 min-w-0 flex items-center gap-3 p-2 rounded-lg text-left ${state.activeChatId === chat.id ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    <Icons.MessageSquare className="w-5 h-5 flex-shrink-0" /><span className="font-semibold text-[15px] truncate">{chat.title}</span>
                                </button>
                                <button onClick={() => {
                                    if (!window.confirm(`Удалить чат «${chat.title}»? Это действие нельзя отменить.`)) return;
                                    const remaining = state.chatSessions.filter(c => c.id !== chat.id);
                                    if (remaining.length === 0) {
                                        const nid = Date.now();
                                        updateState({ chatSessions: [{ id: nid, title: 'Новый чат', messages: [] }], activeChatId: nid });
                                    } else if (state.activeChatId === chat.id) {
                                        updateState({ chatSessions: remaining, activeChatId: remaining[0].id });
                                    } else {
                                        updateState({ chatSessions: remaining });
                                    }
                                }} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Удалить чат">
                                    <Icons.Trash className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                    
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
