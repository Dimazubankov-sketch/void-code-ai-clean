import { useState } from 'react';
import { AI_MODELS, getPlanLimits, REASONING_LEVELS, defaultReasoningFor, isReasoningAllowed, getReasoningLevel, isModelAllowedForPlan } from '@/shared/config/models';
import { Icons } from '@/shared/ui/Icons';
import { PressButton } from '@/shared/ui/PressButton';

// ==========================================
// ModelSelector — выбор модели + уровня рассуждений
// ==========================================
// Раньше жил только в шапке чата (TopHeader.jsx). Задача 7: перенесён в
// само поле ввода (компактная pill-кнопка в нижнем ряду composer'а, как
// «⚡ Быстрый» в референсе) — вынесен в отдельный файл, чтобы не дублировать
// логику дропдауна между шапкой и composer'ом.
//
// compact=true — уменьшенная pill для строки инструментов composer'а
// (иконка + короткое имя модели, без явной обводки-«стекла», как в
// референсе); compact=false — прежний вид для использования где-либо ещё.
export function ModelSelector({ state, updateState, compact = false }) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [showReasoning, setShowReasoning] = useState(false);
    const activeModel = AI_MODELS.find(m => m.id === state.selectedModelId) || AI_MODELS[0];
    const maxDaily = getPlanLimits(state.userPlan).daily;
    const limitExhausted = maxDaily !== Infinity && state.usedDailyLimits >= maxDaily;

    const currentReasoningId = (state.reasoningByModel || {})[activeModel.id] || defaultReasoningFor(activeModel.id);
    const currentReasoning = getReasoningLevel(currentReasoningId);
    const pickReasoning = (levelId) => {
        if (!isReasoningAllowed(levelId, state.userPlan)) return;
        updateState({ reasoningByModel: { ...(state.reasoningByModel || {}), [activeModel.id]: levelId } });
        setShowReasoning(false);
    };

    return (
        <div className="relative min-w-0">
            <PressButton
                onClick={() => setShowDropdown(!showDropdown)}
                className={compact
                    ? "void-tap-target flex items-center gap-1.5 pl-2.5 pr-2 py-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-left min-w-0"
                    : "void-tap-target flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-xl border border-black/[0.06] dark:border-white/10 shadow-sm hover:bg-white/90 dark:hover:bg-white/[0.16] transition-colors text-left min-w-0 max-w-[42vw] sm:max-w-none"}
            >
                <div className={`flex items-center gap-1 font-extrabold dark:text-white leading-tight min-w-0 ${compact ? 'text-[13px]' : 'text-[13px] sm:text-[15px] md:text-lg'}`}>
                    <span className="truncate">{activeModel.name}</span> <Icons.ChevronDown className="w-4 h-4 flex-shrink-0" />
                </div>
            </PressButton>
            {showDropdown && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)}></div>
                    <div className="fixed left-3 right-3 bottom-24 sm:bottom-auto sm:top-auto md:absolute md:left-auto md:right-0 md:bottom-full md:mb-2 md:w-96 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-2xl z-50 overflow-hidden fade-in">
                        {limitExhausted && (
                            <div className="mx-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl flex gap-2 items-start">
                                <Icons.Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" style={{width:'16px',height:'16px',minWidth:'16px'}} />
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Дневной лимит исчерпан. Доступна только модель Void Mini — остальные вернутся через 6 часов (см. вкладку «Лимиты»).</p>
                            </div>
                        )}
                        <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
                            {AI_MODELS.map(m => {
                                const planLocked = !isModelAllowedForPlan(m.id, state.userPlan);
                                const limitLocked = limitExhausted && m.cost > 0;
                                const locked = limitLocked || planLocked;
                                return (
                                    <PressButton key={m.id} disabled={limitLocked} onClick={() => {
                                        if (planLocked) { updateState({ currentView: 'pricing' }); setShowDropdown(false); return; }
                                        if (locked) { alert('Вы исчерпали дневной лимит. Лимиты обновятся автоматически через 6 часов — доступна модель Void Mini без ограничений.'); return; }
                                        updateState({selectedModelId: m.id}); setShowDropdown(false);
                                    }} className={`w-full text-left p-4 rounded-2xl transition-colors flex flex-col gap-1 ${locked ? 'opacity-40 cursor-not-allowed' : ''} ${state.selectedModelId === m.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : (locked ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}`}>
                                        <div className="flex justify-between w-full">
                                            <span className={`font-extrabold text-[15px] ${state.selectedModelId === m.id ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-900 dark:text-white'}`}>{m.name}</span>
                                            {state.selectedModelId === m.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" />}
                                            {planLocked && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400">Апгрейд</span>}
                                            {!planLocked && locked && <Icons.Info className="w-4 h-4 text-amber-500" style={{width:'16px',height:'16px'}} />}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</p>
                                    </PressButton>
                                );
                            })}
                        </div>
                        <div className="border-t border-gray-100 dark:border-darkBorder p-2">
                            <PressButton onClick={() => { setShowReasoning(true); setShowDropdown(false); }} className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left">
                                <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center shrink-0"><Icons.Sparkles className="w-4 h-4" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-sm dark:text-white">Уровень рассуждений</p>
                                    <p className="text-xs text-gray-400 truncate">{currentReasoning.name} · {currentReasoning.desc}</p>
                                </div>
                                <Icons.ChevronDown className="w-4 h-4 text-gray-400 -rotate-90 shrink-0" />
                            </PressButton>
                        </div>
                    </div>
                </>
            )}
            {showReasoning && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowReasoning(false)}></div>
                    <div className="fixed left-3 right-3 bottom-24 sm:bottom-auto md:absolute md:left-auto md:right-0 md:bottom-full md:mb-2 md:w-80 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-2xl z-50 overflow-hidden fade-in">
                        <div className="px-4 pt-4 pb-2">
                            <p className="font-extrabold dark:text-white">Уровень рассуждений</p>
                            <p className="text-xs text-gray-400">Модель: {activeModel.name}</p>
                        </div>
                        <div className="p-2 flex flex-col gap-1">
                            {REASONING_LEVELS.map(l => {
                                const allowed = isReasoningAllowed(l.id, state.userPlan);
                                const active = currentReasoningId === l.id;
                                return (
                                    <PressButton key={l.id} onClick={() => pickReasoning(l.id)} disabled={!allowed}
                                        className={`w-full text-left p-3.5 rounded-2xl transition-colors flex items-center gap-3 ${!allowed ? 'opacity-40 cursor-not-allowed' : (active ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}`}>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-extrabold text-sm ${active ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-900 dark:text-white'}`}>{l.name}</span>
                                                {!allowed && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400">Pro и выше</span>}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{l.desc}</p>
                                        </div>
                                        {active && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-400 shrink-0" />}
                                    </PressButton>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
