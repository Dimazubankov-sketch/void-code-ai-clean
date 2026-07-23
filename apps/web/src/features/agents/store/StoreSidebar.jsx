import { Icons } from '@/shared/ui/Icons';

// Боковая навигация магазина: закреплена слева на ПК, снизу на телефоне.
const NAV = [
    { id: 'store', label: 'Магазин', icon: 'Store' },
    { id: 'my', label: 'Мои агенты', icon: 'Robot' },
    { id: 'billing', label: 'Биллинг', icon: 'Wallet' },
];

export function StoreSidebar({ active, onSelect }) {
    return (
        <>
            {/* ПК: вертикальный сайдбар */}
            <aside className="hidden sm:flex w-56 flex-shrink-0 flex-col border-r border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard p-3 gap-1">
                <div className="flex items-center gap-2.5 px-3 py-4 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#312a6b] via-[#3f4dab] to-[#a52fe0] flex items-center justify-center">
                        <Icons.Store className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-extrabold text-lg dark:text-white">Маркет</span>
                </div>
                {NAV.map(n => {
                    const IconC = Icons[n.icon];
                    const on = active === n.id;
                    return (
                        <button key={n.id} onClick={() => onSelect(n.id)} className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-bold transition-colors text-left ${on ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                            <IconC className="w-5 h-5 shrink-0" /> {n.label}
                        </button>
                    );
                })}
            </aside>

            {/* Телефон: нижняя навигация */}
            <nav className="sm:hidden fixed bottom-0 inset-x-0 z-10 flex border-t border-gray-100 dark:border-darkBorder bg-white dark:bg-darkCard">
                {NAV.map(n => {
                    const IconC = Icons[n.icon];
                    const on = active === n.id;
                    return (
                        <button key={n.id} onClick={() => onSelect(n.id)} className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors ${on ? 'text-[#5b32d4] dark:text-purple-300' : 'text-gray-400'}`}>
                            <IconC className="w-5 h-5" /> {n.label}
                        </button>
                    );
                })}
            </nav>
        </>
    );
}
