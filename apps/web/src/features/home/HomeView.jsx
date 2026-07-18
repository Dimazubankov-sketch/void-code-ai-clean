import { useState, useEffect, useRef } from 'react';
import { Icons } from '@/shared/ui/Icons';


// ==========================================
// ЭКРАНЫ ПРИЛОЖЕНИЯ
// ==========================================
export function HomeView({ state, updateState, handleSendMessage, handleGenerateImage, chatFileInputRef }) {
    // Ключ пересоздаёт логотип при клике — самый надёжный способ
    // перезапустить CSS-анимацию по требованию, а не только один раз
    // при первом появлении экрана.
    const [logoPlayKey, setLogoPlayKey] = useState(0);
    // false — при первом заходе играет intro-анимация; после клика по логотипу
    // включается отдельная анимация «всплытия».
    const [logoPopped, setLogoPopped] = useState(false);
    // Плейсхолдер поля ввода вместо статичного текста "печатается" при
    // наведении курсора (а на телефоне — при фокусе на поле, раз навести
    // курсор там нечем).
    const placeholderFull = 'Написать запрос...';
    const [typedPlaceholder, setTypedPlaceholder] = useState('');
    const typeTimerRef = useRef(null);
    useEffect(() => () => clearInterval(typeTimerRef.current), []);
    const startTypewriter = () => {
        if (state.inputValue) return;
        if (typedPlaceholder === placeholderFull) return;
        clearInterval(typeTimerRef.current);
        let i = typedPlaceholder.length;
        typeTimerRef.current = setInterval(() => {
            i++;
            setTypedPlaceholder(placeholderFull.slice(0, i));
            if (i >= placeholderFull.length) clearInterval(typeTimerRef.current);
        }, 45);
    };
    const resetTypewriter = () => {
        clearInterval(typeTimerRef.current);
        if (!state.inputValue) setTypedPlaceholder('');
    };
    // Ключ пересоздаёт <span> при каждом изменении — самый надёжный способ
    // перезапустить CSS-анимацию по требованию (при наведении/тапе), а не
    // только один раз при первом рендере.
    const [waveKey, setWaveKey] = useState(0);
    useEffect(() => {
        // Приветственное покачивание рукой один раз при заходе на страницу
        const t = setTimeout(() => setWaveKey(k => k + 1), 200);
        return () => clearTimeout(t);
    }, []);
    const triggerWave = () => setWaveKey(k => k + 1);

    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in relative">
            {/* Шапка с выбором модели на главном экране убрана — логотип и
                название перенесены в центр экрана. В правом верхнем углу
                остаётся только кнопка меню («две палочки»), смещённая
                чуть ниже верхнего края. */}
            <div className="fixed top-5 right-4 sm:top-6 sm:right-6 z-30">
                {state.user ? (
                    <div className="flex items-center gap-2">
                        {/* Колокольчик — центр уведомлений (почта) */}
                        <button onClick={() => updateState({showNotifications: true})} className="void-tap-target relative flex-shrink-0 p-2.5 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder">
                            <Icons.Bell className="w-6 h-6" />
                            {(Object.values(state.orchestratorReports || {}).some(list => list.some(r => r.status === 'pending'))
                              || (state.inbox?.updates || []).some(u => !(state.readUpdateIds || []).includes(u.id))
                              || (state.inbox?.personal || []).some(m => !(state.readPersonalIds || []).includes(m.id))) && (
                                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-darkCard" />
                            )}
                        </button>
                        <button onClick={() => updateState({isRightMenuOpen: true})} className="void-tap-target flex-shrink-0 p-2.5 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder">
                            <Icons.TwoLines className="w-6 h-6" />
                        </button>
                    </div>
                ) : (
                    <button onClick={() => updateState({showAuthModal: true})} className="void-tap-target flex-shrink-0 px-5 py-2.5 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-xl transition-colors shadow-md text-sm whitespace-nowrap">
                        Войти
                    </button>
                )}
            </div>

            <div className="px-6 pt-16 sm:pt-20 max-w-4xl mx-auto">
                {/* Логотип и название смещены влево: логотип стоит над кнопкой «плюс»
                    строки ввода, текст — справа от логотипа. Анимации логотипа и текста
                    проигрываются при появлении экрана (перезагрузка страницы или переход
                    на главный экран из других вкладок); логотип также можно кликнуть,
                    чтобы проиграть анимацию ещё раз. */}
                <div className="flex items-center gap-3 sm:gap-4 mb-8 sm:mb-10">
                    <Icons.VoidLogo key={logoPlayKey} onClick={() => { setLogoPopped(true); setLogoPlayKey(k => k + 1); }} title="Нажмите, чтобы повторить анимацию" className={`${logoPopped ? 'void-home-logo-pop' : 'void-home-logo'} w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 flex-shrink-0 mt-1.5 sm:mt-2 cursor-pointer`} />
                    <div className="leading-none">
                        <div className="void-title-rise font-extrabold tracking-tight text-2xl sm:text-3xl md:text-4xl">
                            <span className="void-grad-text">VOID</span> <span className="text-[#1a1a2e] dark:text-white">CODE AI</span>
                        </div>
                        <div className="void-subtitle-rise mt-1.5 sm:mt-2 text-xs sm:text-sm md:text-base font-semibold tracking-wide text-gray-400 dark:text-gray-500">AI Control System</div>
                    </div>
                </div>

                <div className="void-input-rise relative max-w-4xl mx-auto pointer-events-auto mb-10">
                    {state.selectedImage && (
                        <div className="absolute -top-16 left-4 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder fade-in group z-10">
                            <img src={state.selectedImage} className="h-14 w-14 object-cover rounded-lg" />
                            <button onClick={() => updateState({selectedImage: null})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X /></button>
                        </div>
                    )}
                    <div onMouseEnter={startTypewriter} onMouseLeave={resetTypewriter} className="flex items-end bg-white dark:bg-darkCard rounded-3xl border border-gray-200 dark:border-darkBorder shadow-md focus-within:ring-4 focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4] transition-all relative">
                        <input type="file" ref={chatFileInputRef} onChange={(e) => {
                            if(e.target.files[0]) {
                                const r = new FileReader();
                                r.onloadend = () => updateState({selectedImage: r.result});
                                r.readAsDataURL(e.target.files[0]);
                            }
                        }} accept="image/*" className="hidden" />
                        <button onClick={() => chatFileInputRef.current?.click()} className="void-tap-target absolute left-3 sm:left-4 bottom-2.5 sm:bottom-3 p-2.5 sm:p-2 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-full flex items-center justify-center">
                            <Icons.Plus className="w-6 h-6" />
                        </button>
                        {!state.inputValue && (
                            <div className="absolute left-14 right-16 top-0 py-5 pointer-events-none text-gray-400 text-[16px] truncate">
                                {typedPlaceholder}
                                {typedPlaceholder && typedPlaceholder.length < placeholderFull.length && <span className="void-type-cursor">|</span>}
                            </div>
                        )}
                        <textarea 
                            className="w-full pl-14 pr-16 py-5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32 min-h-[64px] text-[16px]"
                            placeholder=""
                            value={state.inputValue}
                            onFocus={startTypewriter}
                            onChange={(e) => { 
                                updateState({inputValue: e.target.value}); 
                                e.target.style.height = 'auto'; 
                                e.target.style.height = (e.target.scrollHeight < 128 ? e.target.scrollHeight : 128) + 'px'; 
                            }}
                            onKeyDown={(e) => { 
                                if (e.key === 'Enter' && !e.shiftKey) { 
                                    e.preventDefault(); 
                                    handleSendMessage(); 
                                    e.target.style.height = 'auto'; 
                                } 
                            }}
                            rows={1}
                        />
                        <button onClick={() => handleSendMessage()} disabled={(!state.inputValue.trim() && !state.selectedImage) || state.isGenerating} className="void-tap-target absolute right-2.5 sm:right-3 top-2.5 sm:top-3 bottom-2.5 sm:bottom-3 aspect-square bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-2xl flex items-center justify-center transition-all shadow-md">
                            <Icons.ArrowUp />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4 md:gap-5 mb-8 sm:mb-10">
                    <div onClick={() => updateState({selectedModelId: 'flash_ext', currentView: 'chat'})} className="bg-white dark:bg-darkCard p-3.5 sm:p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div style={{animationDelay: '0ms'}} className="void-icon-pop w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-purple-50 dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 rounded-xl md:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 md:mb-4"><Icons.MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <h3 className="font-bold text-sm sm:text-base md:text-lg mb-0.5 sm:mb-1 dark:text-white">Умный чат</h3>
                        <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 font-medium">Общайтесь на любые темы с AI.</p>
                    </div>
                    <div onClick={() => updateState({selectedModelId: 'pro', currentView: 'chat'})} className="bg-white dark:bg-darkCard p-3.5 sm:p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div style={{animationDelay: '60ms'}} className="void-icon-pop w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl md:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 md:mb-4"><Icons.Code className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <h3 className="font-bold text-sm sm:text-base md:text-lg mb-0.5 sm:mb-1 dark:text-white">Генератор кода</h3>
                        <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 font-medium">Пишите и отлаживайте код.</p>
                    </div>
                    <div onClick={() => updateState({imageGenMode: true, currentView: 'chat'})} className="bg-white dark:bg-darkCard p-3.5 sm:p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div style={{animationDelay: '120ms'}} className="void-icon-pop w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded-xl md:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 md:mb-4"><Icons.Image className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <h3 className="font-bold text-sm sm:text-base md:text-lg mb-0.5 sm:mb-1 dark:text-white">Создать изображение</h3>
                        <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 font-medium">Опишите идею — получите картинку.</p>
                    </div>
                    <div onClick={() => updateState({currentView: 'agent-builder'})} className="bg-white dark:bg-darkCard p-3.5 sm:p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div style={{animationDelay: '180ms'}} className="void-icon-pop w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl md:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 md:mb-4"><Icons.Robot className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <h3 className="font-bold text-sm sm:text-base md:text-lg mb-0.5 sm:mb-1 dark:text-white">Агенты</h3>
                        <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 font-medium">Соберите AI-агента под задачу.</p>
                    </div>
                    <div onClick={() => updateState({currentView: 'cockpit'})} className="bg-white dark:bg-darkCard p-3.5 sm:p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div style={{animationDelay: '210ms'}} className="void-icon-pop w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 rounded-xl md:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 md:mb-4"><Icons.RobotArmy className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <h3 className="font-bold text-sm sm:text-base md:text-lg mb-0.5 sm:mb-1 dark:text-white">Управление агентами</h3>
                        <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 font-medium">Cockpit: статусы, оркестраторы, задачи.</p>
                    </div>
                    <div onClick={() => updateState({currentView: 'site-builder'})} className="relative bg-white dark:bg-darkCard p-3.5 sm:p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-gray-100 dark:border-darkBorder shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div style={{animationDelay: '240ms'}} className="void-icon-pop w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl md:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-3 md:mb-4"><Icons.Globe className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <h3 className="font-bold text-sm sm:text-base md:text-lg mb-0.5 sm:mb-1 dark:text-white">Конструктор сайтов</h3>
                        <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 font-medium">Соберите макет — остальное сделает ИИ.</p>
                    </div>
                </div>
            </div>

            {/* Компактная кнопка помощи — только стикер, угол экрана.
                При наведении подсказывает слово «Помощь». */}
            {state.user && (
                <button
                    onClick={() => updateState({ currentView: 'guide' })}
                    title="Помощь"
                    aria-label="Помощь"
                    className="group fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-30 flex items-center gap-2 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg text-amber-600 dark:text-amber-400 rounded-full shadow-lg border border-gray-200 dark:border-darkBorder hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all p-3"
                >
                    <Icons.Help className="w-5 h-5" />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold group-hover:max-w-[80px] group-hover:pr-1 transition-all duration-300">Помощь</span>
                </button>
            )}
        </div>
    );
}
