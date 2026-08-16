import { useState, useRef } from 'react';
import { gsap } from 'gsap';
import { AI_MODELS, getPlanLimits, REASONING_LEVELS, defaultReasoningFor, isReasoningAllowed, getReasoningLevel } from '@/shared/config/models';
import { Icons } from '@/shared/ui/Icons';
import { ChatActionsMenu } from '@/features/chat/ChatActionsMenu';
import { PressButton } from '@/shared/ui/PressButton';

// ==========================================
// IconCircleButton — круглая кнопка с полупрозрачной обводкой + GSAP
// ==========================================
// Общий стиль для «Назад» и «Троеточие» в шапке чата: круглая, с лёгкой
// полупрозрачной обводкой/фоном (в стиле Gemini/iOS), и GSAP-откликом
// на наведение (лёгкое увеличение) и нажатие (лёгкое сжатие) — согласно
// требованию использовать ТОЛЬКО GSAP для подобных анимаций, без
// CSS-transition на transform.
function IconCircleButton({ onClick, title, children, solid = false }) {
    const ref = useRef(null);
    const onEnter = () => gsap.to(ref.current, { scale: 1.08, duration: 0.18, ease: 'power2.out' });
    const onLeave = () => gsap.to(ref.current, { scale: 1, duration: 0.22, ease: 'power2.out' });
    const onDown = () => gsap.to(ref.current, { scale: 0.9, duration: 0.1, ease: 'power2.out' });
    const onUp = () => gsap.to(ref.current, { scale: 1.08, duration: 0.15, ease: 'back.out(2.4)' });
    return (
        <button
            ref={ref}
            onClick={onClick}
            title={title}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onMouseDown={onDown}
            onMouseUp={onUp}
            onTouchStart={onDown}
            onTouchEnd={onUp}
            /* Стекло: полупрозрачный фон + backdrop-blur. Текст чата под
               кнопкой остаётся едва различимым — именно этого требует
               референс. solid больше не делает кнопку непрозрачной, он
               лишь чуть плотнее: сплошной белый разрушал бы эффект. */
            className={`void-tap-target flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl border shadow-sm ${
                solid
                    ? 'bg-white/60 dark:bg-white/[0.14] border-white/50 dark:border-white/15 text-gray-900 dark:text-white'
                    : 'bg-white/45 dark:bg-white/[0.10] border-white/40 dark:border-white/10 text-gray-900 dark:text-white'
            }`}
            style={{ willChange: 'transform' }}
        >
            {children}
        </button>
    );
}

export function TopHeader({ state, updateState, onChatMenuAction }) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [showReasoning, setShowReasoning] = useState(false);
    const [showChatMenu, setShowChatMenu] = useState(false);
    const activeModel = AI_MODELS.find(m => m.id === state.selectedModelId) || AI_MODELS[1];
    const maxDaily = getPlanLimits(state.userPlan).daily;
    const limitExhausted = maxDaily !== Infinity && state.usedDailyLimits >= maxDaily;

    const inChatView = state.currentView === 'chat';

    // Задача 13 отменена по требованию — эффект блюра/fade под шапкой
    // убран полностью, шапка возвращена к исходному виду (bg /70).

    // Текущий уровень рассуждений выбранной модели (с учётом дефолта по модели)
    const currentReasoningId = (state.reasoningByModel || {})[activeModel.id] || defaultReasoningFor(activeModel.id);
    const currentReasoning = getReasoningLevel(currentReasoningId);
    const pickReasoning = (levelId) => {
        if (!isReasoningAllowed(levelId, state.userPlan)) return;
        updateState({ reasoningByModel: { ...(state.reasoningByModel || {}), [activeModel.id]: levelId } });
        setShowReasoning(false);
    };

    // Селектор модели + чип уровня рассуждений — общий блок, переиспользуется
    // и в grid-раскладке чата, и в обычной раскладке Хаба.
    const ModelSelectorBlock = (
        <div className="flex items-center gap-1.5">
            <div className="relative min-w-0">
                <PressButton onClick={() => setShowDropdown(!showDropdown)} className="void-tap-target flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/45 dark:bg-white/[0.10] backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-sm hover:bg-white/60 dark:hover:bg-white/[0.16] transition-colors text-left min-w-0 max-w-[42vw] sm:max-w-none">
                    <div className="flex items-center gap-1 font-extrabold text-[13px] sm:text-[15px] md:text-lg dark:text-white leading-tight min-w-0">
                        <span className="truncate">{activeModel.name}</span> <Icons.ChevronDown className="w-4 h-4 flex-shrink-0" />
                    </div>
                </PressButton>
                {showDropdown && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)}></div>
                        <div className="fixed left-3 right-3 top-16 md:absolute md:left-auto md:top-full md:right-0 md:mt-2 md:w-96 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-2xl z-50 overflow-hidden fade-in">
                            {limitExhausted && (
                                <div className="mx-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl flex gap-2 items-start">
                                    <Icons.Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" style={{width:'16px',height:'16px',minWidth:'16px'}} />
                                    <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Дневной лимит исчерпан. Доступна только модель Void Mini — остальные вернутся через 6 часов (см. вкладку «Лимиты»).</p>
                                </div>
                            )}
                            <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
                                {AI_MODELS.map(m => {
                                    const locked = limitExhausted && m.cost > 0;
                                    return (
                                        <PressButton key={m.id} disabled={locked} onClick={() => {
                                            if (locked) { alert('Вы исчерпали дневной лимит. Лимиты обновятся автоматически через 6 часов — доступна модель Void Mini без ограничений.'); return; }
                                            updateState({selectedModelId: m.id}); setShowDropdown(false);
                                        }} className={`w-full text-left p-4 rounded-2xl transition-colors flex flex-col gap-1 ${locked ? 'opacity-40 cursor-not-allowed' : ''} ${state.selectedModelId === m.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : (locked ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-800')}`}>
                                            <div className="flex justify-between w-full">
                                                <span className={`font-extrabold text-[15px] ${state.selectedModelId === m.id ? 'text-[#5b32d4] dark:text-purple-400' : 'text-gray-900 dark:text-white'}`}>{m.name}</span>
                                                {state.selectedModelId === m.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" />}
                                                {locked && <Icons.Info className="w-4 h-4 text-amber-500" style={{width:'16px',height:'16px'}} />}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</p>
                                        </PressButton>
                                    );
                                })}
                            </div>
                            {/* Уровень рассуждений — под выбором моделей */}
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
                {/* Окно выбора уровня рассуждений */}
                {showReasoning && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowReasoning(false)}></div>
                        <div className="fixed left-3 right-3 top-16 md:absolute md:left-auto md:top-full md:right-0 md:mt-2 md:w-80 bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-3xl shadow-2xl z-50 overflow-hidden fade-in">
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
            {/* Уровень рассуждений — компактный чип СПРАВА от модели.
                Клик сразу открывает окно выбора уровня, минуя общий дропдаун. */}
            <button
                onClick={() => { setShowReasoning(true); setShowDropdown(false); }}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300 text-xs font-bold hover:bg-[#e0dbf4] dark:hover:bg-purple-900/30 transition-colors"
                title="Уровень рассуждений"
            >
                <Icons.Sparkles className="w-3.5 h-3.5" />
                {currentReasoning.name}
            </button>
        </div>
    );

    // ---- Раскладка для чата: строгое центрирование через 3-колоночный grid ----
    // Раньше центрирование селектора модели держалось на flex-1 распорках
    // слева/справа — при разной ширине левой/правой групп кнопок селектор
    // визуально «плавал» не по центру. Grid с равными 1fr-колонками по
    // краям даёт математически точное центрирование независимо от того,
    // сколько кнопок в левой/правой группе.
    if (inChatView) {
        return (
            /* Настоящее стекло, не белая плашка с затуханием вниз.
               Раньше верхняя точка градиента была ПОЛНОСТЬЮ непрозрачной
               (from-white), поэтому текст под шапкой не было видно вовсе,
               а сам градиент без backdrop-blur давал резкий, отчётливо
               заметный край. Теперь два разных слоя:
               1) сама полоса шапки (h-16) — постоянная лёгкая
                  полупрозрачность + blur: текст под ней виден, но
                  приглушён, ровно на всей высоте шапки, без утечки в 100%
                  непрозрачность у верхнего края;
               2) более узкая мягкая кайма под шапкой (без blur, только
                  градиент до полной прозрачности) — сглаживает переход к
                  обычному контенту чата, чтобы не было жёсткой границы.
               pointer-events-none — чтобы слои не перехватывали клики и скролл. */
            <div className="sticky top-0 z-30 px-3 sm:px-4 md:px-6 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-16 -z-10 pointer-events-none backdrop-blur-xl bg-white/40 dark:bg-darkBg/45"
                />
                <div
                    aria-hidden
                    className="absolute inset-x-0 top-16 h-8 -z-10 pointer-events-none bg-gradient-to-b from-white/40 to-transparent dark:from-darkBg/45 dark:to-transparent"
                />
                <div className="flex items-center justify-self-start">
                    <IconCircleButton onClick={() => updateState({ currentView: 'home' })} title="Назад">
                        <Icons.ChevronLeft className="w-5 h-5" />
                    </IconCircleButton>
                </div>
                <div className="justify-self-center">
                    {ModelSelectorBlock}
                </div>
                <div className="flex items-center gap-2 justify-self-end">
                    {/* Троеточие (действия с чатом) — сдвинуто левее, чтобы
                        освободить крайнее правое место под кнопку «Меню»
                        (см. ниже), которая должна стоять там же, где и в Хабе. */}
                    {onChatMenuAction && (
                        <div className="relative">
                            <IconCircleButton onClick={() => setShowChatMenu(v => !v)} title="Действия с чатом">
                                <Icons.Dots className="w-5 h-5" />
                            </IconCircleButton>
                            <ChatActionsMenu
                                open={showChatMenu}
                                onClose={() => setShowChatMenu(false)}
                                onAction={(action) => {
                                    setShowChatMenu(false);
                                    onChatMenuAction(action);
                                }}
                            />
                        </div>
                    )}
                    {/* Кнопка «Меню» (две полоски) — возвращена в шапку чата,
                        на том же крайнем правом месте, где она стоит в Хабе.
                        Круглая обводка, непрозрачный белый фон (solid) —
                        полностью идентична кнопке меню на главном экране. */}
                    <IconCircleButton onClick={() => updateState({ isRightMenuOpen: true })} title="Меню" solid>
                        <Icons.TwoLines className="w-5 h-5" />
                    </IconCircleButton>
                </div>
            </div>
        );
    }

    // ---- Раскладка для Хаба (главная) — логотип слева, меню справа ----
    // Задача 7: логотип/надпись Void Code AI сдвинуты чуть левее — уменьшен
    // левый отступ шапки (было pl-3 sm:pl-4 md:pl-8).
    return (
        <div className="bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg sticky top-0 z-30 pl-1.5 sm:pl-2 md:pl-5 pr-3 sm:pr-4 md:pr-6 h-16 flex items-center gap-2">
            <div className="flex items-center gap-2 sm:gap-2.5 font-extrabold tracking-tight cursor-pointer text-[#1a1a2e] dark:text-white min-w-0 leading-none" onClick={() => updateState({currentView: 'home'})}>
                <Icons.VoidLogo className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0" />
                <span className="text-base sm:text-xl md:text-2xl truncate leading-none"><span className="void-grad-text">VOID</span> CODE AI</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 min-w-0 ml-auto">
                {ModelSelectorBlock}
                {state.user ? (
                    // В Хабе кнопка меню (TwoLines) — круглая, но с ОБЫЧНЫМ
                    // непрозрачным белым фоном (без backdrop-blur/полупрозрачности),
                    // в отличие от кнопок «Назад»/«Троеточие» в чате.
                    <IconCircleButton onClick={() => updateState({isRightMenuOpen: true})} title="Меню" solid>
                        <Icons.TwoLines className="w-5 h-5" />
                    </IconCircleButton>
                ) : (
                    <button onClick={() => updateState({showAuthModal: true})} className="void-tap-target flex-shrink-0 px-4 sm:px-5 py-2.5 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-xl transition-colors shadow-md text-sm whitespace-nowrap">
                        Войти
                    </button>
                )}
            </div>
        </div>
    );
}
