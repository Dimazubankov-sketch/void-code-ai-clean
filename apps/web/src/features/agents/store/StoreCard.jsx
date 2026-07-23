import { formatMoney } from '@/shared/lib/format';
import { Icons } from '@/shared/ui/Icons';

// Карточка агента в сетке магазина. Минимализм + фирменный градиент Void.
// premium=true — оркестратор: градиентная рамка/свечение.
export function StoreCard({ item, premium = false, owned = false, onOpen, index = 0 }) {
    const IconC = Icons[item.icon] || Icons.Robot;
    return (
        <button
            onClick={() => onOpen(item)}
            style={{ animationDelay: `${index * 70}ms` }}
            className={`void-pop-up group relative text-left rounded-3xl p-5 flex flex-col transition-all hover:-translate-y-0.5 ${
                premium
                    ? 'bg-white dark:bg-darkCard shadow-md'
                    : 'bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md'
            }`}
            style={premium ? { border: '2px solid transparent', backgroundImage: 'linear-gradient(var(--tw-bg-opacity, white), var(--tw-bg-opacity, white)), linear-gradient(135deg, #312a6b, #3f4dab, #a52fe0)', backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box' } : {}}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${premium ? 'bg-gradient-to-br from-[#312a6b] via-[#3f4dab] to-[#a52fe0] text-white' : 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300'}`}>
                    <IconC className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                    <p className="font-extrabold dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 truncate">{item.tagline}</p>
                </div>
            </div>
            <ul className="space-y-1.5 mb-4 flex-1">
                {item.abilities.slice(0, 3).map((ab, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                        <Icons.Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" /> {ab}
                    </li>
                ))}
            </ul>
            <div className="flex items-center justify-between mt-auto">
                <span className="font-extrabold text-lg dark:text-white">{formatMoney(item.price)} ₽</span>
                <span className={`px-4 py-2 rounded-xl text-white font-bold text-sm ${premium ? 'bg-gradient-to-r from-[#5b32d4] to-[#a52fe0]' : 'bg-[#5b32d4] group-hover:bg-[#4a26b0]'} transition-colors`}>
                    {owned ? 'Установить' : 'Купить'}
                </span>
            </div>
        </button>
    );
}
