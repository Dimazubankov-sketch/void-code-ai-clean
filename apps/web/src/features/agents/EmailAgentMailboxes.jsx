import { MAIL_PROVIDERS } from '@/shared/config/agents';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// УПРАВЛЕНИЕ ПОЧТАМИ АГЕНТА-ПИСЬМА
// ==========================================
// После покупки агента-письма можно менять/добавлять почты, с которыми он
// работает (Voidops, Gmail, Mail.ru, Яндекс, Outlook, iCloud). Открывается из
// списка агентов; те же изменения оркестратор может сделать через промт.

export function EmailAgentMailboxes({ state, updateState, agent, onClose }) {
    const current = agent.mailboxes || [];

    const toggle = (providerId) => {
        const next = current.includes(providerId)
            ? current.filter(m => m !== providerId)
            : [...current, providerId];
        const agents = (state.aiAgents || []).map(a => a.id === agent.id ? { ...a, mailboxes: next, updatedAt: Date.now() } : a);
        updateState({ aiAgents: agents });
    };

    return (
        <div className="fixed inset-0 z-[75] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-1">
                    <h4 className="font-extrabold text-lg dark:text-white">Почты агента</h4>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <p className="text-sm text-gray-400 mb-5">Выберите, с какими ящиками работает «{agent.name}». Можно подключить несколько.</p>
                <div className="grid grid-cols-3 gap-3 mb-2">
                    {MAIL_PROVIDERS.map(p => {
                        const IconC = Icons[p.icon];
                        const active = current.includes(p.id);
                        return (
                            <button key={p.id} onClick={() => toggle(p.id)} className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${active ? 'border-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20' : 'border-gray-100 dark:border-darkBorder hover:border-gray-200'}`}>
                                {IconC && <IconC className="w-8 h-8" />}
                                <span className="text-[11px] font-semibold dark:text-gray-200 text-center leading-tight">{p.name}</span>
                                {active && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#5b32d4] flex items-center justify-center"><Icons.Check className="w-2.5 h-2.5 text-white" /></span>}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3">Подсказка: то же самое можно попросить сделать оркестратора текстом в его чате.</p>
            </div>
        </div>
    );
}
