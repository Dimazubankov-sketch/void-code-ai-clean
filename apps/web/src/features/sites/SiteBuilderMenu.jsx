import { useState } from 'react';
import { PLAN_LABEL, SITE_LIMIT_LABEL, computeSitePrice } from '@/shared/config/sites';
import { formatPrice } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// КОНСТРУКТОР САЙТОВ  (доступен на Pro и Ultra)
// Пользователь собирает макет (блоки, отдельно под ПК и под телефон),
// описывает каждый блок, сохраняет — и дальше правки вносятся через чат
// с ИИ, который «ведёт» сайт. Готовый сайт пишет ИИ; превью можно
// посмотреть, а код и права открываются после оплаты через кошелёк.
// ==========================================
// ==========================================
// МЕНЮ КОНСТРУКТОРА САЙТОВ (ШТОРКА)
// История сайтов, лимит на создание за день и переход в общие настройки —
// тот же паттерн, что и в конструкторе AI-агентов (значок с двумя полосками).
// ==========================================
export function SiteBuilderMenu({ open, onClose, sites, usedToday, dailyLimit, userPlan, onNewSite, onOpenSite, onEditSite, onDeleteSite, onRenameSite, onOpenSettings }) {
    const sorted = [...sites].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const limitLabel = SITE_LIMIT_LABEL[userPlan] || String(dailyLimit);
    const pct = dailyLimit ? Math.min(100, Math.round((usedToday / dailyLimit) * 100)) : 0;
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');

    return (
        <>
            <div className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}></div>
            <div className={`fixed top-0 right-0 h-full w-[85vw] max-w-sm bg-white dark:bg-darkCard z-50 shadow-2xl transition-transform duration-300 flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-darkBorder flex-shrink-0">
                    <h3 className="text-lg font-extrabold dark:text-white">Меню сайтов</h3>
                    <button onClick={onClose} className="void-tap-target p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center"><Icons.X /></button>
                </div>

                <div className="p-5 pb-0 flex-shrink-0 space-y-3">
                    <button onClick={onNewSite} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold transition-colors shadow-md">
                        <Icons.Plus /> Новый сайт
                    </button>

                    {/* Лимит на создание сайтов за сегодня */}
                    <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-darkBorder">
                        <div className="flex items-center gap-2.5 mb-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.BarChart className="w-4 h-4" /></div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold dark:text-white">Лимит на сегодня</div>
                                <div className="text-xs text-gray-400">{usedToday} из {limitLabel} сайтов · тариф {PLAN_LABEL[userPlan] || 'Free'}</div>
                            </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div className="h-full bg-[#5b32d4] rounded-full transition-all duration-500" style={{ width: pct + '%' }} />
                        </div>
                    </div>
                </div>

                <div className="px-5 pt-5 flex-1 overflow-y-auto pb-6">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">История сайтов</h4>
                    {sorted.length === 0 ? (
                        <div className="text-center py-14">
                            <Icons.Globe className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                            <p className="text-gray-400 dark:text-gray-600 text-sm font-medium">Пока нет ни одного сайта</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sorted.map(s => {
                                const price = s.paid ? (s.price || computeSitePrice(s)) : computeSitePrice(s);
                                return (
                                    <div key={s.id} className="p-3 rounded-2xl border border-transparent bg-gray-50 dark:bg-gray-800/40 hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                                        {renamingId === s.id ? (
                                            <div className="flex items-center gap-2 mb-1">
                                                <input
                                                    autoFocus
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') { onRenameSite(s.id, renameValue.trim() || s.name || 'Мой сайт'); setRenamingId(null); } if (e.key === 'Escape') setRenamingId(null); }}
                                                    className="flex-1 min-w-0 p-2 bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder rounded-lg text-sm font-bold dark:text-white focus:outline-none focus:border-[#5b32d4]"
                                                />
                                                <button onClick={() => { onRenameSite(s.id, renameValue.trim() || s.name || 'Мой сайт'); setRenamingId(null); }} className="void-tap-target p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg flex-shrink-0"><Icons.Check className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <button onClick={() => onOpenSite(s)} className="w-full text-left mb-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="font-bold text-sm truncate text-gray-900 dark:text-white">{s.name || 'Мой сайт'}</p>
                                                    {s.paid
                                                        ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex-shrink-0">Оплачен</span>
                                                        : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex-shrink-0">Ждёт оплаты</span>}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">{(s.layoutDesktop || []).length} блоков · {formatPrice(price)} ₽</p>
                                            </button>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => { setRenamingId(s.id); setRenameValue(s.name || 'Мой сайт'); }} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-[#5b32d4] hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors" title="Переименовать"><Icons.PenTool className="w-4 h-4" /></button>
                                            {s.paid && <button onClick={() => onEditSite(s)} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-[#5b32d4] hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors" title="Редактировать"><Icons.Pencil className="w-4 h-4" /></button>}
                                            <button onClick={() => { if (window.confirm(`Удалить сайт «${s.name || 'Мой сайт'}»?`)) onDeleteSite(s.id); }} className="void-tap-target flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors" title="Удалить"><Icons.Trash className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-darkBorder flex-shrink-0">
                    <button onClick={onOpenSettings} className="void-tap-target w-11 h-11 flex items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors" title="Настройки">
                        <Icons.Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </>
    );
}
