import { Icons } from '@/shared/ui/Icons';


// ==========================================
// UI КОМПОНЕНТЫ
// ==========================================
export function ListItem({ icon: Icon, label, extra, border = true, onClick }) {
    return (
        <div onClick={onClick} className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors ${border ? 'border-b border-gray-50 dark:border-gray-800/50' : ''} rounded-2xl`}>
            <div className="flex items-center gap-4">
                <div className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl"><Icon /></div>
                <span className="font-bold text-[15px] dark:text-white">{label}</span>
            </div>
            <div className="flex items-center gap-3">
                {extra}
                {onClick && !extra && <Icons.ChevronRight />}
            </div>
        </div>
    );
}
