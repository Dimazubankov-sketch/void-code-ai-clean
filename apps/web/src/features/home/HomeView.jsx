import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { ImageEditorModal } from '@/features/chat/ImageEditorModal';
import { getAttachmentLimit } from '@/shared/config/models';
import { VoiceWaveMic } from '@/features/chat/VoiceWaveMic';
import { compressImageFiles } from '@/shared/lib/imageCompress';
import { useExpandableComposer } from '@/shared/lib/useExpandableComposer';
import { QuickActions } from '@/features/home/QuickActions';
import { ContinueWork } from '@/features/home/ContinueWork';
import { ToolsSection } from '@/features/home/ToolsSection';
import { AllToolsModal } from '@/features/home/AllToolsModal';


// ==========================================
// ЭКРАНЫ ПРИЛОЖЕНИЯ
// ==========================================
export function HomeView({ state, updateState, handleSendMessage, handleGenerateImage, chatFileInputRef, voiceMode }) {
    const lang = state.lang || 'ru';
    // Клик по карточке-ярлыку (Смарт-чат / Код / Изображение) всегда
    // начинает НОВЫЙ чат, а не открывает что попало.
    const startNewChat = (extra = {}) => {
        const nid = Date.now();
        updateState({
            chatSessions: [{ id: nid, title: t(lang, 'menu.newChat'), messages: [] }, ...state.chatSessions],
            activeChatId: nid,
            currentView: 'chat',
            ...extra,
        });
    };

    // Голосовой ввод (новый UX): клик по микрофону запускает запись с
    // анимацией на всём поле, «+» становится «×», микрофон — квадратом.
    // После остановки — фаза «Преобразование в текст», затем распознанный
    // текст ДОБАВЛЯЕТСЯ к тексту, уже находящемуся в поле ввода.
    const voice = useVoiceRecorder((text) => {
        updateState({ inputValue: ((state.inputValue || '') + (state.inputValue ? ' ' : '') + text).trim() });
    }, state.voiceLang || 'ru-RU');
    // Задача 6: запись голоса — тоже функция «только после входа». Гостю
    // показываем модалку вместо запуска микрофона (тот же паттерн, что и
    // у handleSendMessage/voiceMode.open).
    const startVoiceGuarded = () => {
        if (!state.user) { updateState({ showAuthModal: true }); return; }
        voice.start();
    };
    // Ключ пересоздаёт логотип при клике — самый надёжный способ
    // перезапустить CSS-анимацию по требованию, а не только один раз
    // при первом появлении экрана.
    const [logoPlayKey, setLogoPlayKey] = useState(0);
    // false — при первом заходе играет intro-анимация; после клика по логотипу
    // включается отдельная анимация «всплытия».
    const [logoPopped, setLogoPopped] = useState(false);
    const [editingImage, setEditingImage] = useState(null);
    const [showAllTools, setShowAllTools] = useState(false);

    // Единая точка для «требует входа» — используется всеми пунктами
    // ниже (Агенты, Voice Studio, Оркестраторы, Коннекторы, Проекты,
    // Библиотека, Скиллы), тот же паттерн, что уже применён к чату/картинкам/
    // голосу/Cockpit/почте (Задача 6).
    const requireAuth = (fn) => () => {
        if (!state.user) { updateState({ showAuthModal: true }); return; }
        fn();
    };
    const goAgents = requireAuth(() => updateState({ currentView: 'agent-store' }));
    const goAgentStoreCreate = requireAuth(() => updateState({ currentView: 'agent-store', agentStoreTab: 'store' }));
    const goVoiceStudio = requireAuth(() => updateState({ currentView: 'settings', settingsOpenSection: 'voice' }));
    const goConnectors = requireAuth(() => updateState({ currentView: 'plugins' }));
    const goProjects = requireAuth(() => updateState({ currentView: 'projects' }));
    const goLibrary = requireAuth(() => updateState({ currentView: 'library' }));
    const goSkills = requireAuth(() => updateState({ currentView: 'skills' }));
    const goAnalyzeFile = () => { startNewChat(); requestAnimationFrame(() => chatFileInputRef.current?.click()); };

    // «Попробуйте» — второстепенные pill-кнопки, ровно та же
    // функциональность, что раньше была на больших карточках 2×2.
    const quickActionItems = [
        { icon: Icons.Image, label: t(lang, 'home.createImage'), onClick: () => startNewChat({ imageGenMode: true }) },
        { icon: Icons.Code, label: t(lang, 'home.codeGen'), onClick: () => startNewChat({ selectedModelId: 'pro' }) },
        { icon: Icons.Robot, label: 'Создать агента', onClick: goAgentStoreCreate },
        { icon: Icons.Paperclip, label: 'Проанализировать файл', onClick: goAnalyzeFile },
    ];

    // «Инструменты» — компактные tiles. Voice Mode сюда намеренно не
    // входит (см. комментарий в ToolsSection.jsx) — это способ общения
    // через Composer, а не отдельный инструмент.
    const toolTiles = [
        { icon: Icons.MessageSquare, label: 'Чат', color: 'text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20', onClick: () => startNewChat({ selectedModelId: 'flash_ext' }) },
        { icon: Icons.Image, label: 'Изображения', color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20', onClick: () => startNewChat({ imageGenMode: true }) },
        { icon: Icons.Robot, label: 'Агенты', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20', onClick: goAgents },
        { icon: Icons.Volume2, label: 'Voice Studio', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', onClick: goVoiceStudio },
        { icon: Icons.Code, label: 'Код', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', onClick: () => startNewChat({ selectedModelId: 'pro' }) },
    ];

    // «Все инструменты» — полный каталог, категоризированный, только
    // реально существующие функции.
    const toolCategories = [
        { title: 'AI', items: [
            { icon: Icons.MessageSquare, label: 'Чат', color: 'text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20', onClick: () => startNewChat({ selectedModelId: 'flash_ext' }) },
            { icon: Icons.Code, label: 'Код', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', onClick: () => startNewChat({ selectedModelId: 'pro' }) },
            { icon: Icons.Image, label: 'Изображения', color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20', onClick: () => startNewChat({ imageGenMode: true }) },
        ] },
        { title: 'Создание', items: [
            { icon: Icons.Volume2, label: 'Voice Studio', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', onClick: goVoiceStudio },
        ] },
        { title: 'Автоматизация', items: [
            { icon: Icons.Robot, label: 'Агенты', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20', onClick: goAgents },
            { icon: Icons.Sparkles, label: 'Оркестраторы', color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20', onClick: goAgentStoreCreate },
            { icon: Icons.Plug, label: 'Коннекторы', color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20', onClick: goConnectors },
        ] },
        { title: 'Рабочее пространство', items: [
            { icon: Icons.Folder, label: 'Проекты', color: 'text-[#5b32d4] bg-[#efecf9] dark:bg-purple-900/20', onClick: goProjects },
            { icon: Icons.Library, label: 'Библиотека', color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20', onClick: goLibrary },
            { icon: Icons.Skills, label: 'Скиллы', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', onClick: goSkills },
        ] },
    ];
    const homeTextareaRef = useRef(null);
    const homeComposerWrapRef = useRef(null);
    const homeExpandedTextareaRef = useRef(null);
    const { expanded: composerExpanded, manyChars: composerManyChars, enterFullscreen: composerEnterFullscreen, exitFullscreen: composerExitFullscreen, insertIndent: composerInsertIndent } = useExpandableComposer({
        value: state.inputValue,
        onChange: (v) => updateState({ inputValue: v }),
    });

    // Тот же баг-фикс, что и в ChatView.jsx: сброс инлайновой высоты
    // textarea при опустошении поля (после отправки кликом по кнопке
    // высота раньше «застревала» растянутой под длинный текст).
    useEffect(() => {
        if (state.inputValue === '' && homeTextareaRef.current) {
            homeTextareaRef.current.style.height = '';
        }
    }, [state.inputValue]);

    // Сжимаем перед конвертацией в data-URL — см. подробный комментарий
    // в ChatView.jsx (addImageFiles): без этого фото с телефона в base64
    // легко превышало лимит тела запроса и Vision падал с HTTP 413.
    const addImageFiles = (fileList) => {
        const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;
        const limit = getAttachmentLimit(state.userPlan);
        const current = state.selectedImages || [];
        const roomLeft = Math.max(0, limit - current.length);
        if (roomLeft === 0) {
            alert(`Лимит вложений на вашем тарифе — ${limit} фото за раз.`);
            return;
        }
        const toAdd = files.slice(0, roomLeft);
        if (files.length > roomLeft) {
            alert(`Можно приложить не больше ${limit} фото. Добавлены первые ${roomLeft}.`);
        }
        compressImageFiles(toAdd).then((results) => {
            updateState({ selectedImages: [...current, ...results] });
        });
    };
    // Плейсхолдер поля ввода вместо статичного текста "печатается" сам по себе.
    const placeholderFull = t(lang, 'home.inputPlaceholder');
    const [typedPlaceholder, setTypedPlaceholder] = useState('');
    const typeTimerRef = useRef(null);

    // Анимация печати плейсхолдера идёт периодически сама по себе (не по
    // наведению): печатает текст → замирает на ~17с → стирает → повторяет.
    useEffect(() => {
        let cancelled = false;
        const type = (cb) => {
            let i = 0;
            typeTimerRef.current = setInterval(() => {
                if (cancelled) return;
                i++;
                setTypedPlaceholder(placeholderFull.slice(0, i));
                if (i >= placeholderFull.length) { clearInterval(typeTimerRef.current); cb && cb(); }
            }, 55);
        };
        const erase = (cb) => {
            let i = placeholderFull.length;
            typeTimerRef.current = setInterval(() => {
                if (cancelled) return;
                i--;
                setTypedPlaceholder(placeholderFull.slice(0, i));
                if (i <= 0) { clearInterval(typeTimerRef.current); cb && cb(); }
            }, 35);
        };
        const cycle = () => {
            if (cancelled) return;
            // Если пользователь печатает — не мешаем, ждём и пробуем снова
            if (state.inputValue) { setTimeout(cycle, 3000); return; }
            type(() => {
                setTimeout(() => {
                    if (cancelled) return;
                    erase(() => { setTimeout(cycle, 600); });
                }, 17000); // застывает на 17 секунд
            });
        };
        const startDelay = setTimeout(cycle, 1200);
        return () => { cancelled = true; clearTimeout(startDelay); clearInterval(typeTimerRef.current); };
    }, [state.inputValue, placeholderFull]);
    const [waveKey, setWaveKey] = useState(0);
    useEffect(() => {
        const tmr = setTimeout(() => setWaveKey(k => k + 1), 200);
        return () => clearTimeout(tmr);
    }, []);

    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in relative">
            <div className="fixed top-5 right-4 sm:top-6 sm:right-6 z-30">
                {state.user ? (
                    <div className="flex items-center gap-2">
                        {/* Колокольчик — центр уведомлений (почта). Обводка круглая
                            (rounded-full), как и кнопка меню рядом — раньше была
                            квадратная rounded-xl. */}
                        <button
                            onClick={() => {
                                // Задача 6: почта — тоже функция «только после входа».
                                if (!state.user) { updateState({ showAuthModal: true }); return; }
                                updateState({showNotifications: true});
                            }}
                            className="void-tap-target relative flex-shrink-0 p-2.5 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder"
                        >
                            <Icons.Bell className="w-6 h-6" />
                            {(Object.values(state.orchestratorReports || {}).some(list => list.some(r => r.status === 'pending'))
                              || (state.inbox?.updates || []).some(u => !(state.readUpdateIds || []).includes(u.id))
                              || (state.inbox?.personal || []).some(m => !(state.readPersonalIds || []).includes(m.id))) && (
                                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-darkCard" />
                            )}
                        </button>
                        <button onClick={() => updateState({isRightMenuOpen: true})} className="void-tap-target flex-shrink-0 p-2.5 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder">
                            <Icons.TwoLines className="w-6 h-6" />
                        </button>
                    </div>
                ) : (
                    <button onClick={() => updateState({showAuthModal: true})} className="void-tap-target flex-shrink-0 px-5 py-2.5 bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold rounded-xl transition-colors shadow-md text-sm whitespace-nowrap">
                        {t(lang, 'common.login')}
                    </button>
                )}
            </div>

            <div className="px-6 pt-16 sm:pt-20 max-w-4xl mx-auto">
                {/* Логотип и текст — единый блок, а не две независимые
                    детали. Раньше логотип был крупнее текста и висел с
                    произвольным mt, из-за чего смотрелся отдельно от
                    подписи. Теперь: логотип соразмерен блоку текста,
                    выравнивание по центру по вертикали, а заголовок и
                    подзаголовок связаны единой оптической сеткой —
                    подзаголовок растянут по ширине заголовка
                    (tracking + uppercase), поэтому читается как его
                    основание, а не как случайная строка снизу. */}
                <div className="flex items-center gap-3 sm:gap-4 mb-8 sm:mb-10">
                    <Icons.VoidLogo
                        key={logoPlayKey}
                        onClick={() => { setLogoPopped(true); setLogoPlayKey(k => k + 1); }}
                        title="Нажмите, чтобы повторить анимацию"
                        className={`${logoPopped ? 'void-home-logo-pop' : 'void-home-logo'} w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 flex-shrink-0 cursor-pointer`}
                    />
                    <div className="min-w-0">
                        <div className="void-title-rise font-extrabold tracking-tight leading-[1.05] text-2xl sm:text-3xl md:text-4xl">
                            <span className="void-grad-text">VOID</span> <span className="text-[#1a1a2e] dark:text-white">CODE AI</span>
                        </div>
                        <div className="void-subtitle-rise mt-1.5 text-[10px] sm:text-[11px] md:text-xs font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">
                            {t(lang, 'home.subtitle')}
                        </div>
                    </div>
                </div>

                <div className="void-input-rise relative max-w-4xl mx-auto pointer-events-auto mb-10">
                    {(state.selectedImages && state.selectedImages.length > 0) && (
                        <div className="absolute -top-20 left-4 right-4 flex gap-2 overflow-x-auto pb-1 fade-in void-attach-scroll">
                            {state.selectedImages.map((img, i) => (
                                <div key={i} className="relative shrink-0 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder group">
                                    <img
                                        src={img}
                                        onClick={() => setEditingImage({ src: img, index: i, source: 'attachment' })}
                                        className="h-14 w-14 object-cover rounded-lg cursor-pointer"
                                        alt=""
                                    />
                                    <button
                                        onClick={() => updateState({ selectedImages: state.selectedImages.filter((_, idx) => idx !== i) })}
                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md"
                                    >
                                        <Icons.X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div ref={homeComposerWrapRef} className="flex items-end bg-white dark:bg-darkCard rounded-[26px] border border-gray-200 dark:border-darkBorder focus-within:border-gray-300 dark:focus-within:border-gray-600 transition-colors relative">

                        {/* accept="image/*" (не список конкретных MIME) — именно
                            эта маска даёт iOS Safari/WebKit сразу открыть
                            галерею, минуя системное меню «Медиатека/Снимок/
                            Файлы» (см. тот же инпут в ChatView.jsx). */}
                        <input type="file" ref={chatFileInputRef} multiple accept="image/*" className="hidden" onChange={(e) => {
                            addImageFiles(e.target.files);
                            e.target.value = '';
                        }} />
                        {/* «+» слева: при записи переворачивается в «×» (отмена записи) */}
                        <button
                            onClick={() => voice.recording ? voice.cancel() : chatFileInputRef.current?.click()}
                            title={voice.recording ? t(lang, 'chat.cancelRecording') : undefined}
                            className={`void-tap-target absolute left-3 sm:left-4 bottom-2.5 sm:bottom-3 p-2.5 sm:p-2 transition-colors rounded-full flex items-center justify-center z-20 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800`}
                        >
                            <Icons.Plus className={`w-6 h-6 void-plus-rotate ${voice.recording ? 'void-plus-to-x' : ''}`} />
                        </button>

                        {/* Анимация записи — на всё поле ввода */}
                        {voice.recording && (
                            <div className="absolute inset-0 z-10 rounded-3xl bg-[#f3effd]/95 dark:bg-purple-900/40 backdrop-blur-sm flex items-center pl-16 pr-32 pointer-events-none fade-in">
                                <VoiceWaveMic
                                    analyserRef={voice.analyserRef}
                                    className="text-[#5b32d4] dark:text-purple-300"
                                />
                            </div>
                        )}
                        {/* Плейсхолдер фазы «Преобразование в текст» */}
                        {voice.transcribing && !state.inputValue && (
                            <div className="void-transcribe-hint absolute left-14 right-32 top-0 py-5 pointer-events-none text-[#5b32d4] dark:text-purple-300 text-[16px] font-semibold truncate z-10">
                                {t(lang, 'chat.transcribing')}…
                            </div>
                        )}
                        {!state.inputValue && !voice.busy && (
                            <div className="absolute left-14 right-16 top-0 py-5 pointer-events-none text-gray-400 text-[16px] truncate">
                                {typedPlaceholder}
                                {typedPlaceholder && typedPlaceholder.length < placeholderFull.length && <span className="void-type-cursor">|</span>}
                            </div>
                        )}
                        <textarea 
                            ref={homeTextareaRef}
                            className={`w-full pl-14 pr-28 py-5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32 min-h-[64px] text-[16px] ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && state.inputValue ? 'opacity-40' : ''}`}
                            placeholder=""
                            value={state.inputValue}
                            readOnly={voice.busy}
                            onChange={(e) => { 
                                updateState({inputValue: e.target.value}); 
                                e.target.style.height = 'auto'; 
                                e.target.style.height = (e.target.scrollHeight < 128 ? e.target.scrollHeight : 128) + 'px'; 
                            }}
                            onKeyDown={(e) => { 
                                // Задача 4: Enter не отправляет — переносит строку
                                // (стандартное поведение textarea). Отправка — только
                                // кнопкой-стрелкой.
                                if (e.key === 'Tab') { e.preventDefault(); composerInsertIndent(homeTextareaRef.current); }
                            }}
                            rows={1}
                        />
                        {/* Задача 2 (повторный раунд): 57 символов ИЛИ 3
                            отступа — не высота строки. */}
                        {composerManyChars && (
                            <button
                                onClick={composerEnterFullscreen}
                                title="Развернуть на весь экран"
                                className="void-tap-target absolute z-30 top-2 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 dark:bg-darkCard/80 backdrop-blur-sm text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 transition-colors"
                            >
                                <Icons.Maximize className="w-5 h-5" />
                            </button>
                        )}
                        {/* Микрофон: покой → запись (квадрат-стоп) → индикатор загрузки */}
                        {voice.supported && (
                            <button
                                onClick={() => voice.recording ? voice.stop() : (!voice.transcribing && startVoiceGuarded())}
                                title={voice.recording ? t(lang, 'chat.stopRecording') : t(lang, 'home.voiceInput')}
                                disabled={voice.transcribing}
                                className={`void-tap-target absolute right-[4.25rem] sm:right-[4.5rem] bottom-2.5 sm:bottom-3 w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center transition-all z-20 active:border-[#5b32d4] dark:active:border-purple-400 ${voice.recording ? 'bg-[#5b32d4] text-white voice-pulse-purple border-[#5b32d4]' : voice.transcribing ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 border-transparent' : 'text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-transparent'}`}
                            >
                                {voice.recording ? <Icons.Square className="w-5 h-5" /> : voice.transcribing ? <Icons.Spinner className="w-5 h-5" /> : <Icons.Mic className="w-5 h-5" />}
                            </button>
                        )}
                        {(state.inputValue.trim() || (state.selectedImages && state.selectedImages.length > 0)) ? (
                            <button
                                onClick={() => handleSendMessage()}
                                disabled={state.isGenerating || voice.busy}
                                title="Отправить"
                                className="void-tap-target absolute right-2.5 sm:right-3 bottom-2.5 sm:bottom-3 w-10 h-10 sm:w-11 sm:h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-md z-20"
                            >
                                <Icons.ArrowUp className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                onClick={voiceMode.open}
                                disabled={state.isGenerating || voice.busy}
                                title="Voice Mode"
                                className="void-tap-target absolute right-2.5 sm:right-3 bottom-2.5 sm:bottom-3 w-10 h-10 sm:w-11 sm:h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-md z-20"
                            >
                                <Icons.Waveform className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {composerExpanded && createPortal(
                    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center sm:justify-center p-0 sm:p-4 fade-in">
                        <div className="bg-white dark:bg-darkCard w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl flex flex-col shadow-2xl">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                                <button
                                    onClick={() => composerInsertIndent(homeExpandedTextareaRef.current)}
                                    title="Добавить отступ (красная строка)"
                                    className="void-tap-target w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <Icons.Indent className="w-5 h-5" />
                                </button>
                                <span className="text-sm font-bold text-gray-400">Полноэкранный ввод</span>
                                <button
                                    onClick={() => {
                                        composerExitFullscreen();
                                        requestAnimationFrame(() => {
                                            const el = homeTextareaRef.current;
                                            if (!el) return;
                                            el.style.height = 'auto';
                                            el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                                        });
                                    }}
                                    title="Свернуть"
                                    className="void-tap-target w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <Icons.Minimize className="w-5 h-5" />
                                </button>
                            </div>
                            <textarea
                                ref={homeExpandedTextareaRef}
                                autoFocus
                                value={state.inputValue}
                                onChange={(e) => updateState({ inputValue: e.target.value })}
                                enterKeyHint="enter"
                                onKeyDown={(e) => {
                                    if (e.key === 'Tab') {
                                        e.preventDefault();
                                        composerInsertIndent(homeExpandedTextareaRef.current);
                                    }
                                }}
                                placeholder=""
                                className="flex-1 w-full p-4 sm:p-6 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none text-[16px] leading-7"
                            />
                            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                                {voice.supported && (
                                    <button
                                        onClick={() => voice.recording ? voice.stop() : (!voice.transcribing && startVoiceGuarded())}
                                        title={voice.recording ? t(lang, 'chat.stopRecording') : t(lang, 'home.voiceInput')}
                                        disabled={voice.transcribing}
                                        className={`void-tap-target w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all active:border-[#5b32d4] dark:active:border-purple-400 ${voice.recording ? 'bg-[#5b32d4] text-white voice-pulse-purple border-[#5b32d4]' : voice.transcribing ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 border-transparent' : 'text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-transparent'}`}
                                    >
                                        {voice.recording ? <Icons.Square className="w-5 h-5" /> : voice.transcribing ? <Icons.Spinner className="w-5 h-5" /> : <Icons.Mic className="w-5 h-5" />}
                                    </button>
                                )}
                                <button
                                    onClick={() => { handleSendMessage(); composerExitFullscreen(); }}
                                    disabled={(!state.inputValue.trim() && !(state.selectedImages && state.selectedImages.length > 0)) || state.isGenerating || voice.busy}
                                    title="Отправить"
                                    className="void-tap-target w-11 h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-md"
                                >
                                    <Icons.ArrowUp className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                <QuickActions items={quickActionItems} />

                <ContinueWork state={state} updateState={updateState} />

                <ToolsSection tools={toolTiles} onOpenAll={() => setShowAllTools(true)} />
            </div>

            {showAllTools && (
                <AllToolsModal categories={toolCategories} onClose={() => setShowAllTools(false)} />
            )}

            {/* Компактная кнопка помощи — только стикер, угол экрана. */}
            {state.user && (
                <button
                    onClick={() => updateState({ currentView: 'guide' })}
                    title={t(lang, 'home.help')}
                    aria-label={t(lang, 'home.help')}
                    className="group fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-30 flex items-center gap-2 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg text-amber-600 dark:text-amber-400 rounded-full shadow-lg border border-gray-200 dark:border-darkBorder hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all p-3"
                >
                    <Icons.Help className="w-5 h-5" />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold group-hover:max-w-[80px] group-hover:pr-1 transition-all duration-300">{t(lang, 'home.help')}</span>
                </button>
            )}
            {editingImage && (
                <ImageEditorModal
                    image={editingImage}
                    onClose={() => setEditingImage(null)}
                    onApply={(newSrc) => {
                        if (editingImage.source === 'attachment') {
                            const next = [...(state.selectedImages || [])];
                            next[editingImage.index] = newSrc;
                            updateState({ selectedImages: next });
                        }
                        setEditingImage(null);
                    }}
                />
            )}
        </div>
    );
}
