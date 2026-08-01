import { MAIL_PROVIDERS, MESSENGERS } from '@/shared/config/agents';
import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';

// Выезжающая справа панель с деталями агента. Никаких перезагрузок — просто
// выезжает поверх сетки. Для агента с почтой показывает выбор ящика, для
// агента-поддержки — выбор мессенджера.
export function StoreDrawer({ item, premium, mailbox, setMailbox, messenger, setMessenger, balance = 0, onBuy, onClose }) {
    if (!item) return null;
    const IconC = Icons[item.icon] || Icons.Robot;
    const insufficient = balance < (item.price || 0);
    return (
        <div className="fixed inset-0 z-[80] flex justify-end" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 fade-in" />
            <div className="relative w-full sm:max-w-md h-full bg-white dark:bg-darkCard shadow-2xl slide-in-right flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <span className="font-bold text-sm text-gray-400">Детали агента</span>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex items-center gap-4 mb-5">
                        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 ${premium ? 'bg-gradient-to-br from-[#312a6b] via-[#3f4dab] to-[#a52fe0] text-white' : 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300'}`}>
                            <IconC className="w-8 h-8" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-extrabold text-xl dark:text-white">{item.name}</h3>
                            <p className="text-sm text-gray-400">{item.tagline}</p>
                        </div>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6">{item.description}</p>

                    {/* «Скриншоты» — плейсхолдеры-превью в фирменном градиенте */}
                    <div className="flex gap-3 mb-6 overflow-x-auto no-scrollbar">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="w-40 h-24 rounded-2xl bg-gradient-to-br from-[#efecf9] to-[#e7defb] dark:from-purple-900/20 dark:to-indigo-900/20 flex items-center justify-center shrink-0 border border-gray-100 dark:border-darkBorder">
                                <IconC className="w-7 h-7 text-[#5b32d4]/40" />
                            </div>
                        ))}
                    </div>

                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Что умеет</p>
                    <ul className="space-y-2 mb-6">
                        {item.abilities.map((ab, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-200">
                                <Icons.Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" /> {ab}
                            </li>
                        ))}
                    </ul>

                    {/* Выбор почты для агента-письма */}
                    {item.needsMailbox && (
                        <>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Почта для агента</p>
                            <div className="grid grid-cols-3 gap-3 mb-2">
                                {MAIL_PROVIDERS.map(p => {
                                    const PIcon = Icons[p.icon];
                                    const active = mailbox === p.id;
                                    return (
                                        <button key={p.id} onClick={() => setMailbox(p.id)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${active ? 'border-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20' : 'border-gray-100 dark:border-darkBorder hover:border-gray-200'}`}>
                                            {PIcon && <PIcon className="w-8 h-8" />}
                                            <span className="text-[11px] font-semibold dark:text-gray-200 text-center leading-tight">{p.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                    {/* Выбор мессенджера для агента-поддержки */}
                    {item.needsMessenger && (
                        <>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Мессенджер для агента</p>
                            <div className="grid grid-cols-3 gap-3 mb-2">
                                {MESSENGERS.map(m => {
                                    const MIcon = Icons[m.icon];
                                    const active = messenger === m.id;
                                    return (
                                        <button key={m.id} onClick={() => setMessenger(m.id)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${active ? 'border-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20' : 'border-gray-100 dark:border-darkBorder hover:border-gray-200'}`}>
                                            {MIcon && <MIcon className="w-8 h-8" />}
                                            <span className="text-[11px] font-semibold dark:text-gray-200 text-center leading-tight">{m.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0">
                    {/* Проверка баланса: подсветка красным при нехватке средств */}
                    {insufficient && (
                        <div className="flex items-center gap-2 mb-3 px-3.5 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 fade-in">
                            <Icons.Info className="w-4 h-4 shrink-0" />
                            <span className="text-sm font-semibold">Недостаточно средств. На балансе {formatMoney(balance)} ₽.</span>
                        </div>
                    )}
                    {insufficient ? (
                        <button onClick={() => onBuy(item)} className="w-full py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold transition-colors">
                            Пополнить баланс
                        </button>
                    ) : (
                        <button onClick={() => onBuy(item)} className={`w-full py-3.5 rounded-2xl text-white font-bold transition-colors ${premium ? 'bg-gradient-to-r from-[#5b32d4] to-[#a52fe0] hover:opacity-95' : 'bg-[#5b32d4] hover:bg-[#4a26b0]'}`}>
                            {`Купить за ${formatMoney(item.price)} ₽`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
