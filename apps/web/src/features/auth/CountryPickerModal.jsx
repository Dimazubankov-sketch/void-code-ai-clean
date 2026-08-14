import { useState } from 'react';
import { COUNTRIES } from '@/shared/config/countries';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// Полноэкранная модалка выбора страны (задача 9)
// ==========================================
// Список всех стран с поиском по названию — используется на форме
// регистрации, чтобы подставить телефонный код автоматически.
export function CountryPickerModal({ current, onChoose, onClose }) {
    const [query, setQuery] = useState('');
    const filtered = COUNTRIES.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase()));

    return (
        <div className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm h-[85vh] sm:h-[70vh] rounded-t-3xl sm:rounded-3xl shadow-2xl slide-in-right flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 p-5 pb-3 shrink-0">
                    <h4 className="font-extrabold text-lg dark:text-white flex-1">Страна</h4>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <div className="px-5 pb-3 shrink-0">
                    <div className="relative">
                        <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Поиск страны"
                            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {filtered.map(c => (
                        <button key={c.iso} onClick={() => onChoose(c)} className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-colors ${current?.iso === c.iso ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                            <span className="font-semibold text-sm dark:text-white">{c.name}</span>
                            <span className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-gray-400 font-mono">+{c.dial}</span>
                                {current?.iso === c.iso && <Icons.Check className="w-4 h-4 text-[#5b32d4]" />}
                            </span>
                        </button>
                    ))}
                    {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Ничего не найдено</p>}
                </div>
            </div>
        </div>
    );
}
