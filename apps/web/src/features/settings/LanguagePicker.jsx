import { Icons } from '@/shared/ui/Icons';

// ==========================================
// LanguagePicker — выбор языка интерфейса
// ==========================================
// Пока три языка: русский, английский, китайский. Выбор сохраняется в
// state.lang. Полная локализация интерфейса подключается постепенно; здесь —
// выбор и хранение языка, а тексты переводятся через словарь t().

export const APP_LANGUAGES = [
    { id: 'ru', name: 'Русский', native: 'Русский', flag: '🇷🇺' },
    { id: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
    { id: 'zh', name: '中文', native: '简体中文', flag: '🇨🇳' },
];

export function LanguagePicker({ state, updateState, onClose }) {
    const current = state.lang || 'ru';
    const choose = (id) => { updateState({ lang: id }); onClose(); };

    return (
        <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Globe className="w-5 h-5" /></div>
                    <h4 className="font-extrabold text-lg dark:text-white">Язык интерфейса</h4>
                    <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <p className="text-sm text-gray-400 mb-4">Выберите язык приложения.</p>

                <div className="space-y-1.5">
                    {APP_LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => choose(l.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${current === l.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                            <span className="text-2xl">{l.flag}</span>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm dark:text-white">{l.native}</p>
                                <p className="text-[11px] text-gray-400">{l.name}</p>
                            </div>
                            {current === l.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
