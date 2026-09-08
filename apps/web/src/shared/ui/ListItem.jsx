import { Icons } from '@/shared/ui/Icons';


// ==========================================
// ListItem — строка списка настроек (iOS-стиль, задача #8)
// ==========================================
// Единый размер иконки (18px, как в полях ввода), квадратная подложка,
// отклик на нажатие (active:scale) и аккуратный серый шеврон-афорданс,
// когда строка кликабельна. Значение (extra) и шеврон стоят рядом, как
// в настройках iOS.
export function ListItem({ icon: Icon, label, extra, border = true, onClick }) {
    return (
        <div
            onClick={onClick}
            className={`group flex items-center justify-between gap-3 px-3 py-3 cursor-pointer rounded-2xl transition-all duration-150 active:scale-[0.99] hover:bg-gray-100/70 dark:hover:bg-white/[0.05] ${border ? 'border-b border-gray-100 dark:border-white/[0.04]' : ''}`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 flex items-center justify-center bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 rounded-xl">
                    <Icon className="w-[18px] h-[18px]" />
                </div>
                <span className="font-semibold text-[15px] text-gray-900 dark:text-white truncate">{label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {extra}
                {onClick && <Icons.ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors" />}
            </div>
        </div>
    );
}
