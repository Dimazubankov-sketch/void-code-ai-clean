import { useState } from 'react';
import { AI_MODELS, getPlanLimits } from '@/shared/config/models';
import { Icons } from '@/shared/ui/Icons';


export function TopHeader({ state, updateState }) {
    const [showDropdown, setShowDropdown] = useState(false);
    const activeModel = AI_MODELS.find(m => m.id === state.selectedModelId) || AI_MODELS[1];
    const maxDaily = getPlanLimits(state.userPlan).daily;
    const limitExhausted = maxDaily !== Infinity && state.usedDailyLimits >= maxDaily;

    return (
        <div className="bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg sticky top-0 z-30 border-b border-gray-100 dark:border-darkBorder shadow-sm pl-3 sm:pl-4 md:pl-8 pr-4 sm:pr-6 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-2.5 font-extrabold tracking-tight cursor-pointer text-[#1a1a2e] dark:text-white min-w-0 leading-none" onClick={() => updateState({currentView: 'home'})}>
                <Icons.VoidLogo className="w-11 h-11 md:w-14 md:h-14 flex-shrink-0" />
                <span className="text-base sm:text-xl md:text-2xl truncate leading-none"><span className="void-grad-text">VOID</span> CODE AI</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 min-w-0">
                <div className="relative min-w-0">
                    <button onClick={() => setShowDropdown(!showDropdown)} className="void-tap-target flex items-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-xl transition-colors text-left min-w-0 max-w-[42vw] sm:max-w-none">
                        <div className="flex items-center gap-1 font-extrabold text-[13px] sm:text-[15px] md:text-lg dark:text-white leading-tight min-w-0">
                            <span className="truncate">{activeModel.name}</span> <Icons.ChevronDown className="w-4 h-4 flex-shrink-0" />
                        </div>
                    </button>
                    {showDropdown && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)}></div>
                            <div className="fixed left-3 right-3 top-16 md:absolute md:left-auto md:top-full md:right-0 md:mt-2 md:w-96 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-2xl z-50 overflow-hidden fade-in">
                                {limitExhausted && (
                                    <div className="mx-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl flex gap-2 items-start">
                                        <Icons.Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" style={{width:'16px',height:'16px',minWidth:'16px'}} />
                                        <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Дневной лимит исчерпан. Доступна только модель Flash — остальные вернутся через 8 часов (см. вкладку «Лимиты»).</p>
                                    </div>
                                )}
                                <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
                                    {AI_MODELS.map(m => {
                                        const locked = limitExhausted && m.cost > 0;
                                        return (
                                            <button key={m.id} onClick={() => {
                                                if (locked) { alert('Вы исчерпали дневной лимит. Лимиты обновятся автоматически через 8 часов — доступна модель Flash без ограничений.'); return; }
                                                updateState({selectedModelId: m.id}); setShowDropdown(false);
                                            }} className={`text-left p-4 rounded-2xl transition-colors flex flex-col gap-1 ${locked ? 'opacity-40 cursor-not-allowed' : ''} ${state.selectedModelId === m.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : (locked ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}`}>
                                                <div className="flex justify-between w-full">
                                                    <span className={`font-extrabold text-[15px] ${state.selectedModelId === m.id ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-900 dark:text-white'}`}>{m.name}</span>
                                                    {state.selectedModelId === m.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" />}
                                                    {locked && <Icons.Info className="w-4 h-4 text-amber-500" style={{width:'16px',height:'16px'}} />}
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                {state.user ? (
                    <button onClick={() => updateState({isRightMenuOpen: true})} className="void-tap-target flex-shrink-0 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder">
                        <Icons.TwoLines className="w-6 h-6" />
                    </button>
                ) : (
                    <button onClick={() => updateState({showAuthModal: true})} className="void-tap-target flex-shrink-0 px-4 sm:px-5 py-2.5 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-xl transition-colors shadow-md text-sm whitespace-nowrap">
                        Войти
                    </button>
                )}
            </div>
        </div>
    );
}
