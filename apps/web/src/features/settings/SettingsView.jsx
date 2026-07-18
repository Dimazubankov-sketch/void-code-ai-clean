import { formatMoney } from '@/shared/lib/format';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';
import { ListItem } from '@/shared/ui/ListItem';


export function SettingsView({ state, updateState }) {
    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Настройки</h2>
                </div>
                
                <div className="space-y-6">
                    <div className="bg-white dark:bg-darkCard rounded-[2rem] p-2 shadow-sm border border-gray-100 dark:border-darkBorder">
                        <ListItem icon={Icons.User} label="Личные данные" onClick={() => updateState({currentView: 'profile-edit'})} />
                        <ListItem icon={Icons.BarChart} label="Лимиты" onClick={() => updateState({currentView: 'limits'})} />
                        <ListItem icon={Icons.Star} label="Подписка" extra={<span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-1 rounded-lg border border-green-100 dark:border-green-900/50">{state.userPlan === 'free' ? 'Free' : state.userPlan === 'plus' ? 'Plus' : state.userPlan === 'pro_plus' ? 'Ultra' : 'Pro'}</span>} onClick={() => updateState({currentView: 'pricing'})} />
                        <ListItem icon={Icons.Wallet} label="Кошелёк" extra={<span className="text-xs font-bold text-[#5b32d4] dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-3 py-1 rounded-lg border border-purple-100 dark:border-purple-900/50">{formatMoney(state.walletBalance || 0)} ₽</span>} onClick={() => updateState({currentView: 'wallet'})} />
                    </div>
                    
                    <div className="bg-white dark:bg-darkCard rounded-[2rem] p-2 shadow-sm border border-gray-100 dark:border-darkBorder">
                        <div className="flex items-center justify-between p-4 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/50 rounded-2xl transition-colors" onClick={() => updateState({notificationsEnabled: !state.notificationsEnabled})}>
                            <div className="flex items-center gap-4"><div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 rounded-xl"><Icons.Bell /></div><span className="font-bold text-[15px] dark:text-white">Уведомления</span></div>
                            <div className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center ${state.notificationsEnabled ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${state.notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div></div>
                        </div>
                        <div className="flex items-center justify-between p-4 border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/50 rounded-2xl transition-colors" onClick={() => updateState({isDarkMode: !state.isDarkMode})}>
                            <div className="flex items-center gap-4"><div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-xl"><Icons.Moon /></div><span className="font-bold text-[15px] dark:text-white">Темная тема</span></div>
                            <div className={`w-12 h-7 rounded-full p-1 transition-colors flex items-center ${state.isDarkMode ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${state.isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}></div></div>
                        </div>
                        <ListItem icon={Icons.Globe} label="Язык" extra={<span className="text-sm font-bold text-gray-400">Русский</span>} />
                        <ListItem icon={Icons.Info} label="Версия" extra={<span className="text-sm font-bold text-gray-400">v1.2.0</span>} />
                    </div>

                    <div className="text-center pb-8 pt-4">
                        <button onClick={() => updateState({ user: null, userPlan: 'free', currentView: 'home', isRightMenuOpen: false })} className="font-bold text-red-500 hover:text-red-600 transition-colors p-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 w-full flex justify-center items-center gap-2 border border-red-100 dark:border-red-900/30">
                            <Icons.Logout /> Выйти из аккаунта
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
