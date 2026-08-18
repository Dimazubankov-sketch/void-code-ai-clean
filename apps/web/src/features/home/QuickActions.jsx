import { Icons } from '@/shared/ui/Icons';

// ==========================================
// QuickActions — «Попробуйте»
// ==========================================
// Второстепенный горизонтальный ряд компактных pill-кнопок под Composer.
// Каждая кнопка использует УЖЕ существующую функциональность (те же
// обработчики, что и раньше были на больших карточках 2×2) — здесь нет
// ни одного нового, «придуманного» действия.
export function QuickActions({ items }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="mb-8 sm:mb-10">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Попробуйте</h2>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0 sm:flex-wrap pb-1">
                {items.map((it, i) => (
                    <button
                        key={i}
                        onClick={it.onClick}
                        className="void-tap-target shrink-0 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder hover:border-[#5b32d4]/40 hover:bg-[#faf9ff] dark:hover:bg-purple-900/10 active:scale-[0.97] transition-all shadow-sm"
                    >
                        <span className="w-6 h-6 rounded-full bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 flex items-center justify-center shrink-0">
                            <it.icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{it.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
