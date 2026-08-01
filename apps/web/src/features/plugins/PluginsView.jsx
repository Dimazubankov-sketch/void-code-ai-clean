import { useState } from 'react';
import { goBack } from '@/shared/lib/navigation';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ПЛАГИНЫ — внешние инструменты для агентов
// ==========================================
// Список приложений, с которыми могут работать агенты, разбит по категориям
// с поиском наверху. Справа у каждого инструмента — кнопка «+». По нажатию
// открывается модальное окно: политика безопасности и конфиденциальности +
// кнопка «Перейти к [Название]». После подтверждения пользователь даёт
// агентам разрешение действовать в приложении от его лица.

export const PLUGIN_CATEGORIES = [
    { id: 'all', label: 'Все' },
    { id: 'messengers', label: 'Мессенджеры' },
    { id: 'mail', label: 'Почта' },
    { id: 'sheets', label: 'Таблицы и базы' },
    { id: 'files', label: 'Файлы и диски' },
    { id: 'docs', label: 'Заметки и документы' },
    { id: 'calendar', label: 'Календари и задачи' },
    { id: 'calls', label: 'Видеозвонки' },
    { id: 'dev', label: 'Разработка' },
    { id: 'automation', label: 'Автоматизация' },
    { id: 'crm', label: 'CRM и продажи' },
    { id: 'search', label: 'Веб и поиск' },
];

export const PLUGIN_TOOLS = [
    // Мессенджеры
    { id: 'telegram', category: 'messengers', name: 'Telegram', icon: 'MsgTelegram', desc: 'Сообщения и боты' },
    { id: 'whatsapp', category: 'messengers', name: 'WhatsApp', icon: 'MsgWhatsapp', desc: 'Общение с клиентами' },
    { id: 'vk', category: 'messengers', name: 'ВКонтакте', icon: 'MsgVk', desc: 'Сообщения и сообщества' },
    { id: 'discord', category: 'messengers', name: 'Discord', icon: 'MsgDiscord', desc: 'Серверы и каналы' },
    { id: 'slack', category: 'messengers', name: 'Slack', icon: 'MsgSlack', desc: 'Рабочие чаты команды' },
    // Почта
    { id: 'gmail', category: 'mail', name: 'Gmail', icon: 'ProviderGmail', desc: 'Чтение и отправка писем' },
    { id: 'outlook', category: 'mail', name: 'Outlook', icon: 'ProviderOutlook', desc: 'Почта и календарь' },
    { id: 'yandex', category: 'mail', name: 'Яндекс Почта', icon: 'ProviderYandex', desc: 'Чтение и отправка писем' },
    // Таблицы и базы
    { id: 'gsheets', category: 'sheets', name: 'Google Sheets', icon: 'ProviderGoogleSheets', desc: 'Работа с таблицами' },
    { id: 'airtable', category: 'sheets', name: 'Airtable', icon: 'Sheet', color: 'pink', desc: 'Базы данных' },
    // Файлы и диски
    { id: 'gdrive', category: 'files', name: 'Google Drive', icon: 'ProviderGoogleDrive', desc: 'Файлы и документы' },
    { id: 'dropbox', category: 'files', name: 'Dropbox', icon: 'Dropbox', desc: 'Облачное хранилище файлов' },
    // Заметки и документы
    { id: 'notion', category: 'docs', name: 'Notion', icon: 'Notion', desc: 'Заметки, базы и вики' },
    // Календари и задачи
    { id: 'gcalendar', category: 'calendar', name: 'Google Calendar', icon: 'ProviderGoogleCalendar', desc: 'События и напоминания' },
    { id: 'trello', category: 'calendar', name: 'Trello', icon: 'Trello', desc: 'Доски и задачи команды' },
    // Видеозвонки
    { id: 'zoom', category: 'calls', name: 'Zoom', icon: 'Zoom', desc: 'Видеоконференции' },
    // Разработка
    { id: 'github', category: 'dev', name: 'GitHub', icon: 'Github', color: 'gray', desc: 'Репозитории, issues и PR' },
    // Автоматизация
    { id: 'browser_use', category: 'automation', name: 'Browser Use', icon: 'BrowserUse', color: 'indigo', desc: 'Агент управляет браузером за вас' },
    // CRM и продажи
    { id: 'amocrm', category: 'crm', name: 'AmoCRM', icon: 'ProviderAmoCrm', desc: 'Сделки, контакты и воронка продаж' },
    // Веб и поиск
    { id: 'web_search', category: 'search', name: 'Веб-поиск', icon: 'Search', color: 'green', desc: 'Ищет актуальную информацию в интернете' },
];

const COLOR_CLASSES = {
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    pink: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400',
};

export function PluginsView({ state, updateState }) {
    const lang = state.lang || 'ru';
    const [modalTool, setModalTool] = useState(null);
    const [category, setCategory] = useState('all');
    const [query, setQuery] = useState('');
    const connected = state.connectedPlugins || [];

    const visible = PLUGIN_TOOLS.filter(tool => {
        const matchesCategory = category === 'all' || tool.category === category;
        const matchesQuery = query.trim() === '' || tool.name.toLowerCase().includes(query.trim().toLowerCase());
        return matchesCategory && matchesQuery;
    });
    // Группируем по категориям для аккуратного отображения при "Все"
    const grouped = PLUGIN_CATEGORIES.filter(c => c.id !== 'all').map(c => ({
        ...c,
        tools: visible.filter(t => t.category === c.id),
    })).filter(g => g.tools.length > 0);

    const connect = (tool) => {
        if (!connected.includes(tool.id)) {
            updateState({ connectedPlugins: [...connected, tool.id] });
        }
        setModalTool(null);
    };

    const disconnect = (tool) => {
        updateState({ connectedPlugins: connected.filter(id => id !== tool.id) });
        setModalTool(null);
    };

    const renderTool = (tool) => {
        const IconC = Icons[tool.icon] || Icons.Plug;
        const isOn = connected.includes(tool.id);
        const iconClasses = tool.color ? COLOR_CLASSES[tool.color] : '';
        return (
            <div key={tool.id} className="flex items-center gap-3 bg-white dark:bg-darkCard p-4 rounded-2xl border border-gray-100 dark:border-darkBorder">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconClasses || 'bg-gray-50 dark:bg-gray-800'}`}>
                    <IconC className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm dark:text-white truncate">{tool.name}</p>
                    <p className="text-xs text-gray-400 truncate">{tool.desc}</p>
                </div>
                {isOn ? (
                    <button onClick={() => setModalTool(tool)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-bold shrink-0">
                        <Icons.Check className="w-3.5 h-3.5" /> {t(lang, 'plugins.connected')}
                    </button>
                ) : (
                    <button onClick={() => setModalTool(tool)} title={t(lang, 'plugins.connect')} className="void-tap-target w-10 h-10 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 hover:bg-[#e0dbf4] flex items-center justify-center transition-colors shrink-0">
                        <Icons.Plus className="w-5 h-5" />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-2 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">{t(lang, 'plugins.title')}</h2>
                </div>
                <p className="text-sm text-gray-400 mb-5 ml-1">{t(lang, 'plugins.subtitle')}</p>

                {/* Поиск инструмента */}
                <div className="relative mb-4">
                    <Icons.Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t(lang, 'common.search')}
                        className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] focus:ring-4 focus:ring-[#5b32d4]/10 transition-all shadow-sm"
                    />
                </div>

                {/* Категории */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
                    {PLUGIN_CATEGORIES.map(c => (
                        <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors shrink-0 ${category === c.id ? 'bg-[#5b32d4] text-white' : 'bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>{c.label}</button>
                    ))}
                </div>

                {visible.length === 0 ? (
                    <div className="text-center text-gray-400 py-16">
                        <Icons.Plug className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">Ничего не найдено</p>
                    </div>
                ) : category === 'all' ? (
                    <div className="space-y-6">
                        {grouped.map(g => (
                            <div key={g.id}>
                                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2.5 ml-1">{g.label}</p>
                                <div className="space-y-2.5">{g.tools.map(renderTool)}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2.5">{visible.map(renderTool)}</div>
                )}
            </div>

            {/* Модалка подключения: политика безопасности + «Перейти к …» */}
            {modalTool && (
                <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={() => setModalTool(null)}>
                    <div className="bg-white dark:bg-darkCard w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                            {(() => { const IconC = Icons[modalTool.icon] || Icons.Plug; return (
                                <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0"><IconC className="w-7 h-7" /></div>
                            ); })()}
                            <div className="min-w-0 flex-1">
                                <h4 className="font-extrabold text-lg dark:text-white truncate">{modalTool.name}</h4>
                                <p className="text-xs text-gray-400 truncate">{modalTool.desc}</p>
                            </div>
                            <button onClick={() => setModalTool(null)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                        </div>

                        {/* Политика безопасности и конфиденциальности */}
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-5">
                            <div className="flex items-center gap-2 mb-2">
                                <Icons.Lock className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" />
                                <p className="font-bold text-sm dark:text-white">{t(lang, 'plugins.policyTitle')}</p>
                            </div>
                            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">{t(lang, 'plugins.policyText')}</p>
                        </div>

                        {(state.connectedPlugins || []).includes(modalTool.id) ? (
                            <button onClick={() => disconnect(modalTool)} className="w-full py-3.5 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 font-bold transition-colors hover:bg-red-100 dark:hover:bg-red-900/30">
                                {t(lang, 'plugins.disconnect')}
                            </button>
                        ) : (
                            <button onClick={() => connect(modalTool)} className="w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors flex items-center justify-center gap-2">
                                {t(lang, 'plugins.goTo', { name: modalTool.name })} <Icons.ChevronRight className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
