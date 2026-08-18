import { createPortal } from 'react-dom';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AllToolsModal — «Все инструменты»
// ==========================================
// Полный каталог возможностей, категоризированный, как и просили. Здесь
// только РЕАЛЬНО существующие функции проекта — ни одного фиктивного
// пункта. Каждый onClick ведёт на уже существующий маршрут/экран.
export function AllToolsModal({ categories, onClose }) {
    return createPortal(
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-lg sm:rounded-[2rem] rounded-t-[2rem] shadow-2xl max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <h2 className="text-lg font-extrabold dark:text-white">Все инструменты</h2>
                    <button
                        onClick={onClose}
                        aria-label="Закрыть"
                        className="void-tap-target w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                    {categories.map((cat, ci) => (
                        <div key={ci}>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">{cat.title}</h3>
                            <div className="grid grid-cols-2 gap-2.5">
                                {cat.items.map((it, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { it.onClick(); onClose(); }}
                                        className="void-tap-target flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-[0.97] transition-all text-left"
                                    >
                                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${it.color}`}>
                                            <it.icon className="w-4 h-4" />
                                        </span>
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{it.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}
