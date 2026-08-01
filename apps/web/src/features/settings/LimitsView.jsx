import { useState, useEffect } from 'react';
import { getPlanLimits } from '@/shared/config/models';
import { goBack } from '@/shared/lib/navigation';
import { Icons } from '@/shared/ui/Icons';


export function LimitsView({ state, updateState }) {
    const plan = state.userPlan;
    const planNames = { free: 'Free', plus: 'Plus', pro: 'Pro', pro_plus: 'Ultra' };
    const planName = planNames[plan] || 'Free';
    const { daily: maxDaily, weekly: maxWeekly } = getPlanLimits(plan);

    const usedDaily = state.usedDailyLimits;
    const usedWeekly = state.usedWeeklyLimits || 0;
    const dailyPercent = maxDaily === Infinity ? 100 : Math.min((usedDaily / maxDaily) * 100, 100);
    const weeklyPercent = maxWeekly === Infinity ? 100 : Math.min((usedWeekly / maxWeekly) * 100, 100);
    const dailyLabel = maxDaily === Infinity ? 'Безлимитно' : `${usedDaily} / ${maxDaily}`;
    const weeklyLabel = maxWeekly === Infinity ? 'Безлимитно' : `${usedWeekly} / ${maxWeekly}`;
    const dailyExhausted = maxDaily !== Infinity && usedDaily >= maxDaily;

    // Тикающие часы для обратного отсчёта восстановления дневного лимита —
    // обновляем каждые полминуты, этого достаточно для точности "Xч Yм".
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 30 * 1000);
        return () => clearInterval(id);
    }, []);

    const RESET_WINDOW_MS = 8 * 60 * 60 * 1000;
    const resetInMs = state.dailyLimitExceededAt ? Math.max(0, (state.dailyLimitExceededAt + RESET_WINDOW_MS) - now) : 0;
    const resetHours = Math.floor(resetInMs / (60 * 60 * 1000));
    const resetMinutes = Math.floor((resetInMs % (60 * 60 * 1000)) / (60 * 1000));

    return (
        <div className="flex-1 overflow-y-auto pb-8 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div className="max-w-xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-8 gap-4">
                    <button onClick={() => goBack(state, updateState, 'settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">Лимиты</h2>
                </div>
                <div className="bg-white dark:bg-darkCard rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-darkBorder space-y-6">
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-900/50 flex gap-3 items-start">
                        <Icons.Info className="w-5 h-5 shrink-0 text-[#5b32d4] mt-0.5" style={{width: '20px', height: '20px', minWidth: '20px'}} />
                        <p className="text-sm text-[#5b32d4] dark:text-purple-300 font-medium leading-relaxed flex-1 min-w-0">Обычные запросы к модели <strong>Void Mini</strong> не расходуют премиум-лимиты и не отображаются на графике.</p>
                    </div>
                    {dailyExhausted && state.dailyLimitExceededAt && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 flex gap-3 items-start">
                            <Icons.Info className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" style={{width: '20px', height: '20px', minWidth: '20px'}} />
                            <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold leading-relaxed flex-1 min-w-0">
                                Дневной лимит исчерпан. Доступна модель Void Mini без ограничений.
                                {resetInMs > 0 ? <> Остальные модели вернутся через <strong>{resetHours}ч {resetMinutes}мин</strong>.</> : ' Обновление лимита уже происходит...'}
                            </p>
                        </div>
                    )}
                    <div>
                        <div className="flex justify-between items-end mb-2"><span className="font-bold dark:text-white">Дневной лимит</span><span className={`text-sm font-bold ${dailyExhausted ? 'text-amber-500' : 'text-gray-500'}`}>{dailyLabel} запросов</span></div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3"><div className={`h-3 rounded-full transition-all duration-1000 ${dailyExhausted ? 'bg-amber-500' : 'bg-[#5b32d4]'}`} style={{width: `${dailyPercent}%`}}></div></div>
                    </div>
                    <div>
                        <div className="flex justify-between items-end mb-2"><span className="font-bold dark:text-white">Недельный лимит</span><span className="text-sm font-bold text-gray-500">{weeklyLabel} запросов</span></div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3"><div className="bg-[#5b32d4] h-3 rounded-full transition-all duration-1000" style={{width: `${weeklyPercent}%`}}></div></div>
                    </div>
                    {plan === 'free' && (
                        <button onClick={() => updateState({currentView: 'pricing'})} className="w-full mt-6 bg-[#1a0b38] text-white font-bold py-4 rounded-2xl shadow-lg flex justify-center items-center gap-2 hover:bg-[#2a1b48] transition-colors">
                            <Icons.Star /> Сменить план
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
