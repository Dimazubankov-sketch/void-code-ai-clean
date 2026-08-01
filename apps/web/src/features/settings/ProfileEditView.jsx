import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function ProfileEditView({ state, updateState }) {
    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Личные данные</h2>
                </div>
                <div className="bg-white dark:bg-darkCard rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-darkBorder space-y-5">
                    <div><label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Имя</label><input type="text" value={state.user?.name || ''} onChange={e => updateState({user: {...state.user, name: e.target.value}})} className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl dark:text-white font-medium outline-none transition-all focus:border-[#5b32d4]" /></div>
                    <div><label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Email</label><input type="text" value={state.user?.email || ''} onChange={e => updateState({user: {...state.user, email: e.target.value}})} className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl dark:text-white font-medium outline-none transition-all focus:border-[#5b32d4]" /></div>
                    <div><label className="text-xs font-bold text-gray-500 ml-1 mb-1.5 block">Номер телефона</label><input type="tel" value={state.user?.phone || ''} onChange={e => updateState({user: {...state.user, phone: e.target.value}})} placeholder="+7 (___) ___-__-__" className="w-full p-4 bg-gray-50 dark:bg-[#23232f] border border-gray-100 dark:border-gray-800 rounded-2xl dark:text-white font-medium outline-none transition-all focus:border-[#5b32d4]" /></div>
                    <div className="pt-4"><button onClick={() => updateState({currentView: 'settings'})} className="w-full bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold py-4 rounded-2xl shadow-lg transition-colors">Сохранить</button></div>
                </div>
            </div>
        </div>
    );
}
