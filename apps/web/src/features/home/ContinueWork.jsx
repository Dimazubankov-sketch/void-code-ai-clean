import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ContinueWork — «Продолжить работу»
// ==========================================
// Персональный контекст: последний непустой чат и последний созданный
// проект, взятые из УЖЕ существующих данных (state.chatSessions,
// state.projects) — никаких искусственных hardcoded записей. И чаты, и
// проекты в этом проекте всегда ДОБАВЛЯЮТСЯ В НАЧАЛО своего массива при
// создании (см. RightMenu.jsx/ProjectsView.jsx), поэтому [0] по счёту
// содержимого — уже единственный надёжный признак «последнего» без
// отдельного поля updatedAt, которого в модели данных пока нет.

const fmtRecent = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Сегодня · ${hm}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Вчера · ${hm}`;
    return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} · ${hm}`;
};

export function ContinueWork({ state, updateState }) {
    const chats = state.chatSessions || [];
    const projects = state.projects || [];
    // Первый непустой чат в массиве = последний созданный/активный с
    // сообщениями — та же логика уже применяется в RightMenu (visibleChats).
    const recentChat = chats.find(c => c.messages && c.messages.length > 0);
    const recentProject = projects[0];

    const items = [];
    if (recentProject) {
        items.push({
            key: 'proj-' + recentProject.id,
            icon: Icons.Folder,
            color: 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300',
            title: recentProject.name,
            subtitle: 'Проект',
            time: fmtRecent(recentProject.createdAt || Date.now()),
            onClick: () => updateState({ currentView: 'projects', projectsOpenId: recentProject.id, isRightMenuOpen: false }),
        });
    }
    if (recentChat) {
        items.push({
            key: 'chat-' + recentChat.id,
            icon: Icons.MessageSquare,
            color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
            title: recentChat.title || 'Диалог',
            subtitle: 'Последний диалог',
            // У сообщений в модели данных пока нет собственных таймстампов —
            // id чата создаётся как Date.now() в момент создания, это и есть
            // наиболее точная доступная оценка «когда».
            time: fmtRecent(recentChat.id),
            onClick: () => updateState({ currentView: 'chat', activeChatId: recentChat.id, imageGenMode: false, isRightMenuOpen: false }),
        });
    }

    if (items.length === 0) {
        // EMPTY STATE: аккуратный, не пустая полоса на весь экран.
        return (
            <div className="mb-8 sm:mb-10">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Продолжить работу</h2>
                <div className="bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-[1.75rem] p-6 text-center">
                    <p className="font-bold text-[15px] dark:text-white mb-1">Начните работу с Void Code</p>
                    <p className="text-sm text-gray-400 leading-snug">Создайте чат, изображение, агента или начните новый проект.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-8 sm:mb-10">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Продолжить работу</h2>
            <div className="space-y-2.5">
                {items.slice(0, 3).map(it => (
                    <button
                        key={it.key}
                        onClick={it.onClick}
                        className="void-tap-target w-full flex items-center gap-3 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl p-3.5 sm:p-4 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700 transition-all text-left"
                    >
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${it.color}`}>
                            <it.icon className="w-5 h-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-bold text-[14px] dark:text-white truncate">{it.title}</span>
                            <span className="block text-xs text-gray-400 truncate">{it.subtitle} · {it.time}</span>
                        </span>
                        <Icons.ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0" />
                    </button>
                ))}
            </div>
        </div>
    );
}
