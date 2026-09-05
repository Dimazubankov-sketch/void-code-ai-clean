import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ProjectFormFields — единая форма создания проекта (задача 5)
// ==========================================
// Раньше «Создать проект» выглядело и работало по-разному в зависимости
// от того, откуда открыть: из вкладки «Проекты» — своя модалка с одним
// полем «Название»; из «+» в поле ввода чата / меню сообщения — другая
// модалка (AddToProjectModal) тоже с одним полем, но чуть иной вёрсткой.
// Теперь оба места используют один и тот же блок полей: «Название
// проекта» + необязательное «Описание» — с одинаковыми подписями,
// плейсхолдерами и порядком, независимо от точки входа.
export function ProjectFormFields({ name, setName, description, setDescription, onSubmit, autoFocus = true }) {
    return (
        <>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Название проекта</label>
            <input
                autoFocus={autoFocus}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) onSubmit(); }}
                placeholder="Например: Лендинг для клиента"
                className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-transparent focus:border-[#5b32d4] text-[15px] text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-colors mb-4"
            />

            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Описание (необязательно)</label>
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                placeholder="Кратко опишите цель и рамки проекта…"
                rows={3}
                className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-transparent focus:border-[#5b32d4] text-[15px] text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-colors resize-none mb-1"
            />
        </>
    );
}

// Значок + заголовок — тоже единые, чтобы шапка модалки выглядела
// одинаково независимо от места открытия.
export function ProjectFormHeader({ title = 'Новый проект', onClose }) {
    return (
        <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center shrink-0"><Icons.Folder className="w-5 h-5" /></div>
            <h4 className="font-extrabold text-lg dark:text-white flex-1 truncate">{title}</h4>
            {onClose && <button onClick={onClose} className="p-2 -mr-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><Icons.X className="w-4 h-4" /></button>}
        </div>
    );
}
