import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';
import { PressButton } from '@/shared/ui/PressButton';
import { SegmentedSlider } from '@/shared/ui/SegmentedSlider';
import { AnchoredMenu } from '@/shared/ui/AnchoredMenu';
import { generateBackendImage, submitBackendVideo, pollBackendVideo, listFishVoices, removeImageBackground } from '@/shared/api/chat';
import { compressImageFiles } from '@/shared/lib/imageCompress';
import { EASE, DUR, prefersReducedMotion } from '@/shared/lib/motion';

// ==========================================
// ImagesView — «Изображения» (задача 5)
// ==========================================
// Отдельный инструмент для генерации изображений и видео — по образцу
// Grok Imagine (см. референс): не привязан к истории чата, свой composer
// с переключателем режима (Изображение/Видео) и своими настройками
// (соотношение сторон, качество/скорость для картинок, разрешение и
// длительность для видео), результаты складываются в сетку ниже.
//
// Видео генерируется асинхронно (см. video.service.ts на бэкенде) —
// сразу после отправки в сетке появляется карточка-заглушка со
// статусом, которая сама опрашивает /videos/status/:jobId по таймеру и
// заменяется на готовое видео либо на текст ошибки.

const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
// Задача (сентябрь): Seedance вместо Grok Imagine Video — Grok из
// генерации видео убран полностью. Стандартная = Seedance 2.0 (до 15с),
// Продвинутая = Seedance 2.5 (до 30с, длинноформатные ролики + больше
// референсов). Список доступных длительностей зависит от модели —
// при переключении на «Стандартную» длительность подрезается до её
// максимума (см. handleVideoModelChange ниже).
const VIDEO_MODELS = [
    { id: 'bytedance/seedance-2.0', name: 'Стандартная', maxDuration: 15, durations: [6, 10, 15] },
    { id: 'bytedance/seedance-2.5', name: 'Продвинутая', maxDuration: 30, durations: [6, 10, 15, 20, 30] },
];

export function ImagesView({ state, updateState }) {
    const [mode, setMode] = useState('image'); // 'image' | 'video'
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [showAspect, setShowAspect] = useState(false);
    const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].id);
    const [resolution, setResolution] = useState('480p');
    const [duration, setDuration] = useState(6);
    const [showVideoModel, setShowVideoModel] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // Свой голос в видео (Fish Audio): 'none' — как раньше, модель сама
    // придумывает реплики из текста промпта; 'existing' — один из
    // курируемых голосов Void; 'design' — новый голос по описанию словами
    // (Fish Voice Design). В обоих последних случаях нужен отдельный script
    // — Fish озвучивает буквально то, что ему дали, поэтому нельзя просто
    // взять весь prompt (там ещё и описание сцены, а не только реплики).
    const [voiceMode, setVoiceMode] = useState('none');
    const [voiceId, setVoiceId] = useState(null);
    const [voiceDescription, setVoiceDescription] = useState('');
    const [script, setScript] = useState('');
    const [voices, setVoices] = useState([]);
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    // Пункт 3: выбор голоса теперь отдельная кнопка в шапке (не в поле
    // ввода) — открывает панель с сегментированным переключателем и
    // настройками голоса.
    const [showVoicePanel, setShowVoicePanel] = useState(false);
    // Пункт 4/6/7: только что запущенная генерация видео показывается
    // ОТДЕЛЬНОЙ крупной карточкой НАД полем ввода (а не только в общей
    // сетке результатов снизу) — с прогрессом в процентах, пока не готово,
    // и кнопками «Скачать»/«Редактировать» после готовности.
    const [activeVideoId, setActiveVideoId] = useState(null);
    const [videoProgress, setVideoProgress] = useState(0);
    // #8: полноэкранное окно генерации фото (как у видео — activeVideo).
    // { status:'pending'|'completed'|'failed', url, prompt, error } | null
    const [imgFs, setImgFs] = useState(null);
    // #8: состояние действий панели редактирования в окне генерации фото
    // (удаление фона через Photoroom и т.п.). editBusy — идёт действие;
    // editErr — текст ошибки под панелью.
    const [editBusy, setEditBusy] = useState('');
    const [editErr, setEditErr] = useState('');
    // Задача 1: референсные фото — как в чате, до 4 штук, используются
    // и для image-to-image (обычная генерация картинок уже поддерживает
    // это на бэкенде), и для image-to-video (первое фото уходит как
    // imageUrl — задаёт первый кадр видео).
    const [referenceImages, setReferenceImages] = useState([]);
    const refFileInputRef = useRef(null);
    const gridRef = useRef(null);
    const aspectAnchorRef = useRef(null);
    const videoModelAnchorRef = useRef(null);
    const voicePickerAnchorRef = useRef(null);

    // Задача 4: при переключении режима закрываем все всплывающие меню и
    // видео-панель. Иначе, например, открытая панель озвучки «прилипала» к
    // состоянию: уходишь в «Изображение» — панель прячется (рендерится
    // только в video), но showVoicePanel остаётся true, и при возврате в
    // «Видео» она неожиданно снова открыта. Плюс любой открытый дропдаун
    // (пропорции/модель/голос) должен закрываться при смене режима.
    const handleModeChange = (next) => {
        setMode(next);
        setShowAspect(false);
        setShowVideoModel(false);
        setShowVoicePicker(false);
        if (next !== 'video') setShowVoicePanel(false);
        // Free: длинные ролики недоступны — подрезаем длительность до 6с.
        if (next === 'video' && isFree && duration > FREE_MAX_DURATION) setDuration(FREE_MAX_DURATION);
    };

    const images = state.generatedImages || [];
    // Задача 6: на Free видео доступно, но строго 720p и не длиннее 6с
    // (одно в сутки — лимит следит бэкенд). Ограничиваем и UI, чтобы
    // пользователь не выбирал недоступные параметры.
    const isFree = (state.userPlan || 'free').toLowerCase() === 'free';
    const FREE_MAX_DURATION = 6;
    // stateRef держит АКТУАЛЬНЫЙ state для отложенного опроса статуса
    // видео (pollVideo ниже) — сам tick() живёт в setTimeout и может
    // сработать через много секунд, к тому моменту state как параметр
    // компонента давно устарел бы (тот же паттерн, что и в useVoiceMode.jsx).
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    // Сетка результатов ПОД полем ввода — только изображения.
    // Задача 4: готовое видео не должно появляться под полем ввода. Раньше
    // видео попадало и сюда, из-за чего один и тот же ролик был виден то
    // крупной карточкой над композером, то маленькой карточкой снизу (а
    // после закрытия крупной — вообще только снизу, см. скриншот). Теперь
    // единственное место для видео в студии — карточка НАД полем ввода
    // (activeVideo), а весь архив роликов живёт в Библиотеке (задача 5),
    // куда они и так сохраняются через state.generatedVideos.
    const items = images
        .map(i => ({ ...i, kind: 'image' }))
        .sort((a, b) => b.timestamp - a.timestamp);

    useEffect(() => {
        if (prefersReducedMotion() || !gridRef.current) return;
        const cards = gridRef.current.querySelectorAll('.void-img-card');
        if (!cards.length) return;
        gsap.fromTo(cards, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DUR.panel, ease: EASE.out, stagger: 0.04 });
    }, [items.length]);

    // При перезагрузке страницы цепочка setTimeout из pollVideo умирает
    // вместе со старой вкладкой — если в сохранённом состоянии остались
    // видео со статусом pending, они бы вечно висели «Генерируется…»
    // без единого нового запроса статуса. Возобновляем опрос для них при
    // монтировании экрана.
    useEffect(() => {
        (stateRef.current.generatedVideos || []).forEach(v => {
            if (v.status === 'pending' && v.jobId) pollVideo(v.id, v.jobId);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const gate = () => {
        if (!state.user) { updateState({ showAuthModal: true }); return false; }
        return true;
    };

    const generateImage = async () => {
        if (!gate() || !prompt.trim() || busy) return;
        const thePrompt = prompt.trim();
        setBusy(true);
        setError(null);
        // #8: показываем отдельное полноэкранное окно генерации.
        setImgFs({ status: 'pending', prompt: thePrompt });
        try {
            const url = await generateBackendImage(thePrompt, referenceImages);
            updateState({
                generatedImages: [{ id: Date.now() + Math.random(), prompt: thePrompt, url, timestamp: Date.now(), chatId: null }, ...(stateRef.current.generatedImages || [])],
            });
            setImgFs({ status: 'completed', url, prompt: thePrompt });
            setPrompt('');
            setReferenceImages([]);
        } catch (e) {
            setImgFs({ status: 'failed', prompt: thePrompt, error: e?.message || 'Не удалось сгенерировать изображение' });
        } finally {
            setBusy(false);
        }
    };

    // Опрос статуса видео: карточка-заглушка сама обновляется каждые 5с,
    // пока не придёт completed/failed. Один интервал на задачу — при
    // размонтировании ImagesView опрос просто прекращается (setInterval
    // живёт внутри самой функции-замыкания, а не в состоянии компонента,
    // поэтому явная очистка не нужна: она умрёт вместе со следующим then,
    // как только currentView сменится и стейт перестанет обновляться).
    const pollVideo = (id, jobId) => {
        const tick = async () => {
            try {
                const res = await pollBackendVideo(jobId);
                if (res.status === 'completed' && res.url) {
                    updateState({
                        generatedVideos: (stateRef.current.generatedVideos || []).map(v => v.id === id ? { ...v, status: 'completed', url: res.url, dubbed: !!res.dubbed } : v),
                    });
                    return;
                }
                if (res.status === 'failed' || res.status === 'cancelled' || res.status === 'expired') {
                    updateState({
                        generatedVideos: (stateRef.current.generatedVideos || []).map(v => v.id === id ? { ...v, status: 'failed', error: res.error || 'Генерация не удалась' } : v),
                    });
                    return;
                }
                setTimeout(tick, 5000);
            } catch (e) {
                updateState({
                    generatedVideos: (stateRef.current.generatedVideos || []).map(v => v.id === id ? { ...v, status: 'failed', error: e?.message || 'Ошибка опроса статуса' } : v),
                });
            }
        };
        setTimeout(tick, 4000);
    };

    // Пункт 6: OpenRouter не отдаёт реальный процент готовности видео —
    // только pending/completed/failed. Показываем ОЦЕНОЧНЫЙ прогресс:
    // время генерации у Seedance примерно линейно зависит от длительности
    // ролика и разрешения, поэтому берём грубую эвристику (секунд
    // обработки на секунду видео) и считаем процент от неё. Специально
    // ограничиваем потолком 95% ДО фактического completed — так честнее,
    // чем показать 100% и зависнуть, если реальная генерация чуть дольше
    // оценки.
    useEffect(() => {
        if (!activeVideoId) return undefined;
        const item = (state.generatedVideos || []).find(v => v.id === activeVideoId);
        if (!item || item.status !== 'pending') { setVideoProgress(item?.status === 'completed' ? 100 : 0); return undefined; }
        const secondsPerVideoSecond = item.resolution === '720p' ? 14 : 8;
        const estimatedMs = Math.max(20000, (item.duration || 6) * secondsPerVideoSecond * 1000) + 15000;
        const tick = () => {
            const elapsed = Date.now() - (item.startedAt || item.timestamp);
            setVideoProgress(Math.min(95, Math.round((elapsed / estimatedMs) * 100)));
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [activeVideoId, state.generatedVideos]);

    const activeVideo = activeVideoId ? (state.generatedVideos || []).find(v => v.id === activeVideoId) : null;

    // Пункт 7: «Редактировать» на готовой карточке — возвращает параметры
    // генерации обратно в форму, чтобы пользователь мог поправить промпт
    // или настройки и сгенерировать заново (полноценного видеоредактора
    // здесь нет, это переиспользование настроек, а не покадровый монтаж).
    const editVideo = (item) => {
        setMode('video');
        setPrompt(item.prompt || '');
        if (item.aspectRatio) setAspectRatio(item.aspectRatio);
        if (item.model) setVideoModel(item.model);
        if (item.resolution) setResolution(item.resolution);
        if (item.duration) setDuration(item.duration);
        if (item.imageUrl) setReferenceImages([item.imageUrl]);
        setActiveVideoId(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // #8: «Редактировать» в окне генерации фото — вернуть промпт в форму
    // для правки/повтора и закрыть полноэкранный просмотр.
    const editImageFromFs = () => {
        if (!imgFs) return;
        setMode('image');
        setPrompt(imgFs.prompt || '');
        setImgFs(null);
        setEditErr('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // #8: удалить фон у текущего изображения (Photoroom). Результат
    // подменяет картинку прямо в окне (можно тут же скачать PNG).
    const removeBgFromFs = async () => {
        if (!imgFs?.url || editBusy) return;
        setEditErr('');
        setEditBusy('bg');
        try {
            const newUrl = await removeImageBackground(imgFs.url);
            setImgFs(prev => prev ? { ...prev, url: newUrl, bgRemoved: true } : prev);
        } catch (e) {
            setEditErr(e?.message || 'Не удалось удалить фон.');
        } finally {
            setEditBusy('');
        }
    };

    // #8: вариация — сгенерировать заново по тому же промпту (новый кадр).
    const regenerateFromFs = async () => {
        if (!imgFs?.prompt || editBusy) return;
        setEditErr('');
        setEditBusy('vary');
        setImgFs(prev => prev ? { ...prev, status: 'pending' } : prev);
        try {
            const url = await generateBackendImage(imgFs.prompt, []);
            setImgFs(prev => prev ? { ...prev, url, status: 'completed', bgRemoved: false } : prev);
            updateState({ generatedImages: [{ id: Date.now() + Math.random(), url, prompt: imgFs.prompt, timestamp: Date.now() }, ...(stateRef.current.generatedImages || [])] });
        } catch (e) {
            setEditErr(e?.message || 'Не удалось создать вариацию.');
            setImgFs(prev => prev ? { ...prev, status: 'completed' } : prev);
        } finally {
            setEditBusy('');
        }
    };

    const generateVideo = async () => {
        if (!gate() || !prompt.trim() || busy) return;
        if (voiceMode === 'design' && !voiceDescription.trim()) { setError('Опишите новый голос словами'); return; }
        if (voiceMode !== 'none' && !script.trim()) { setError('Добавьте текст реплики для голоса'); return; }
        setBusy(true);
        setError(null);
        const localId = Date.now() + Math.random();
        try {
            const { jobId } = await submitBackendVideo({
                prompt: prompt.trim(), model: videoModel, aspectRatio, duration, resolution,
                imageUrl: referenceImages[0] || undefined,
                voiceMode, voiceId: voiceId || undefined, voiceDescription: voiceDescription.trim() || undefined, script: script.trim() || undefined,
            });
            updateState({
                generatedVideos: [{
                    id: localId, prompt: prompt.trim(), timestamp: Date.now(), startedAt: Date.now(), status: 'pending', jobId, model: videoModel,
                    // Сохраняем параметры генерации — нужны кнопке
                    // «Редактировать» на готовой карточке (пункт 7),
                    // чтобы вернуть их обратно в форму для правки/повтора.
                    aspectRatio, duration, resolution, imageUrl: referenceImages[0] || null,
                }, ...(stateRef.current.generatedVideos || [])],
            });
            setPrompt('');
            setReferenceImages([]);
            setScript('');
            setActiveVideoId(localId);
            pollVideo(localId, jobId);
        } catch (e) {
            setError(e?.message || 'Не удалось отправить задачу на генерацию видео');
        } finally {
            setBusy(false);
        }
    };

    const handleGenerate = () => (mode === 'image' ? generateImage() : generateVideo());

    // Ленивая подгрузка списка голосов Void — только при первом открытии
    // пикера, а не сразу при переключении в режим видео (тот же принцип
    // кэширования promise'а, что и в useOpenAiTts.jsx).
    const openVoicePicker = () => {
        setShowVoicePicker(v => !v);
        if (voices.length === 0 && !voicesLoading) {
            setVoicesLoading(true);
            listFishVoices().then(setVoices).catch(() => setVoices([])).finally(() => setVoicesLoading(false));
        }
    };

    // При смене модели видео доступные длительности меняются (Seedance
    // 2.0 — до 15с, 2.5 — до 30с). Если текущая длительность не входит
    // в список новой модели, берём ближайшую допустимую вместо того,
    // чтобы отправить на бэкенд значение, которое он же и отклонит.
    const currentVideoModel = VIDEO_MODELS.find(m => m.id === videoModel) || VIDEO_MODELS[0];
    const handleVideoModelChange = (id) => {
        setVideoModel(id);
        const next = VIDEO_MODELS.find(m => m.id === id) || VIDEO_MODELS[0];
        if (!next.durations.includes(duration)) {
            setDuration(next.durations.reduce((best, d) => (d <= next.maxDuration && Math.abs(d - duration) < Math.abs(best - duration) ? d : best), next.durations[0]));
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-darkBg">
            {/* Шапка Image Studio - единая на всех размерах (задача 1):
                • слева - кнопка озвучки (только в режиме видео);
                • по центру - переход обратно в «Чат» (ровно то же место, где
                  в шапке чата стоит кнопка «Image Studio», чтобы возврат был
                  симметричным - раньше эта кнопка была md:hidden и на ПК
                  вернуться в чат из Image Studio было нечем);
                • справа - пустая колонка для симметрии сетки. */}
            <div className="shrink-0 z-30 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-4 md:px-8 bg-white/80 dark:bg-darkBg/80 backdrop-blur-xl">
                <div className="justify-self-start">
                    {mode === 'video' && (
                        <PressButton
                            onClick={() => setShowVoicePanel(v => !v)}
                            title="Озвучка"
                            className={`void-tap-target w-11 h-11 rounded-full border shadow-sm flex items-center justify-center transition-colors ${voiceMode !== 'none' ? 'bg-[#5b32d4] border-[#5b32d4] text-white' : 'bg-white/80 dark:bg-white/10 border-black/[0.06] dark:border-white/10 text-gray-700 dark:text-gray-200'}`}
                        >
                            <Icons.Sliders className="w-4 h-4" />
                        </PressButton>
                    )}
                </div>
                <div className="justify-self-center">
                    <PressButton
                        onClick={() => updateState({ currentView: 'chat' })}
                        className="void-tap-target flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-xl border border-black/[0.06] dark:border-white/10 shadow-sm hover:bg-white/90 dark:hover:bg-white/[0.16] transition-colors text-sm font-bold text-gray-800 dark:text-gray-100"
                    >
                        <Icons.MessageSquare className="w-4 h-4" /> Чат
                    </PressButton>
                </div>
                <div className="justify-self-end">
                    {/* Пустая правая колонка - держит кнопку «Чат» по центру
                        сетки (симметрично с левой колонкой озвучки). */}
                    <span className="w-11 h-11 block" />
                </div>
            </div>

            {/* #5/#7: Image Studio — композер по ЦЕНТРУ экрана. Сетка
                результатов убрана (готовые медиа живут в Библиотеке и в
                полноэкранном окне генерации), разделителя над полем нет. */}
            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-end md:justify-center px-4 md:px-8 py-6">
              <div className="max-w-3xl w-full mx-auto">
                <div className="text-center mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold dark:text-white">Что мы будем создавать?</h1>
                </div>
                <div className="flex items-center justify-center flex-wrap gap-2 mb-3">
                    <div ref={aspectAnchorRef} className="shrink-0">
                        <PressButton onClick={() => setShowAspect(v => !v)} className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            {aspectRatio}
                        </PressButton>
                    </div>
                    <AnchoredMenu open={showAspect} onClose={() => setShowAspect(false)} anchorRef={aspectAnchorRef} width={160}>
                        {ASPECT_RATIOS.map(r => (
                            <PressButton key={r} onClick={() => { setAspectRatio(r); setShowAspect(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${r === aspectRatio ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                {r}
                            </PressButton>
                        ))}
                    </AnchoredMenu>

                    {mode === 'video' && (
                        <>
                            <div ref={videoModelAnchorRef} className="shrink-0">
                                <PressButton onClick={() => setShowVideoModel(v => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    {currentVideoModel.name} <Icons.ChevronDown className="w-3.5 h-3.5" />
                                </PressButton>
                            </div>
                            <AnchoredMenu open={showVideoModel} onClose={() => setShowVideoModel(false)} anchorRef={videoModelAnchorRef} width={224}>
                                {VIDEO_MODELS.map(m => (
                                    <PressButton key={m.id} onClick={() => { handleVideoModelChange(m.id); setShowVideoModel(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${m.id === videoModel ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                        <span className="block">{m.name}</span>
                                        <span className="block text-xs font-normal text-gray-400 dark:text-gray-500 mt-0.5">до {m.maxDuration}с</span>
                                    </PressButton>
                                ))}
                            </AnchoredMenu>
                            <SegmentedSlider
                                className="shrink-0"
                                value={resolution}
                                onChange={setResolution}
                                options={[{ value: '480p', label: '480p' }, { value: '720p', label: '720p' }]}
                            />
                            <SegmentedSlider
                                className="shrink-0"
                                value={duration}
                                onChange={setDuration}
                                options={currentVideoModel.durations
                                    .filter(d => !isFree || d <= FREE_MAX_DURATION)
                                    .map(d => ({ value: d, label: `${d}s` }))}
                            />
                        </>
                    )}
                </div>

                {/* Панель голоса - открывается кнопкой в шапке (пункт 3),
                    а не встроена в тулбар композера. */}
                {mode === 'video' && showVoicePanel && (
                    <div className="mb-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 space-y-2">
                        <SegmentedSlider
                            value={voiceMode}
                            onChange={setVoiceMode}
                            options={[
                                { value: 'none', label: 'Без озвучки' },
                                { value: 'existing', label: 'Голос Void' },
                                { value: 'design', label: 'Новый голос' },
                            ]}
                        />
                        {voiceMode === 'existing' && (
                            <div ref={voicePickerAnchorRef} className="shrink-0">
                                <PressButton onClick={openVoicePicker} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    <span>{voices.find(v => v.id === voiceId)?.title || (voicesLoading ? 'Загрузка голосов…' : 'Случайный голос Void')}</span>
                                    <Icons.ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                </PressButton>
                            </div>
                        )}
                        <AnchoredMenu open={showVoicePicker} onClose={() => setShowVoicePicker(false)} anchorRef={voicePickerAnchorRef} width={240}>
                            {voicesLoading && <p className="px-3 py-2 text-sm text-gray-400">Загрузка…</p>}
                            {!voicesLoading && voices.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Голоса недоступны</p>}
                            {voices.map(v => (
                                <PressButton key={v.id} onClick={() => { setVoiceId(v.id); setShowVoicePicker(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${v.id === voiceId ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                    <span className="block">{v.title}</span>
                                    <span className="block text-xs font-normal text-gray-400 dark:text-gray-500 mt-0.5">{v.description}</span>
                                </PressButton>
                            ))}
                        </AnchoredMenu>

                        {voiceMode === 'design' && (
                            <input
                                type="text"
                                value={voiceDescription}
                                onChange={(e) => setVoiceDescription(e.target.value)}
                                placeholder="Опишите голос словами: тёплый мужской голос диктора…"
                                maxLength={300}
                                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                            />
                        )}

                        {voiceMode !== 'none' && (
                            <textarea
                                value={script}
                                onChange={(e) => setScript(e.target.value.slice(0, 300))}
                                placeholder="Текст реплики, которую скажет голос (до 300 символов)"
                                rows={2}
                                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none"
                            />
                        )}
                        {voiceMode !== 'none' && (
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                Свой голос доступен на тарифах Pro и Ultra. Для этого видео используется Seedance 2.0
                                {voiceMode === 'design' ? ' - голос и реплика генерируются вместе через Fish Voice Design.' : '.'}
                            </p>
                        )}
                    </div>
                )}

                {/* Composer: текст + вложение + режим + отправка (только
                    самое необходимое - остальные настройки вынесены выше). */}
                <div className="bg-white dark:bg-darkCard rounded-[26px] border border-gray-200 dark:border-darkBorder shadow-sm p-4">
                    <input
                        type="file"
                        ref={refFileInputRef}
                        multiple
                        accept="image/jpeg, image/png, image/webp, image/heic"
                        className="hidden"
                        onChange={(e) => {
                            const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/')).slice(0, 4 - referenceImages.length);
                            if (files.length > 0) {
                                compressImageFiles(files).then((results) => {
                                    setReferenceImages(prev => [...prev, ...results].slice(0, 4));
                                });
                            }
                            e.target.value = '';
                        }}
                    />
                    {referenceImages.length > 0 && (
                        <div className="flex items-center gap-2 mb-3">
                            {referenceImages.map((img, i) => (
                                <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-gray-200 dark:border-darkBorder">
                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                    <PressButton
                                        onClick={() => setReferenceImages(prev => prev.filter((_, idx) => idx !== i))}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md"
                                    >
                                        <Icons.X className="w-3 h-3" />
                                    </PressButton>
                                </div>
                            ))}
                        </div>
                    )}
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={mode === 'image' ? 'Опиши изображение…' : 'Опиши видео…'}
                        rows={2}
                        className="w-full bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none text-[16px] mb-3"
                    />
                    {/* Пункт 5: нижний ряд теперь только +, переключатель
                        режима и отправка - остальные настройки живут в
                        отдельном ряду над composer'ом (см. выше). */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {/* Задача 1: «+» - прикрепить референсные фото. Для
                                изображений это image-to-image (уже поддержано
                                бэкендом), для видео - первый кадр (image-to-video). */}
                            <PressButton
                                onClick={() => refFileInputRef.current?.click()}
                                disabled={referenceImages.length >= 4}
                                title="Прикрепить референс"
                                className="void-tap-target w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                            >
                                <Icons.Plus className="w-[18px] h-[18px]" />
                            </PressButton>

                            {/* Переключатель Изображение/Видео - «ползунок»:
                                таблетку можно перетащить пальцем между
                                вариантами, а не только тапнуть по одному из них. */}
                            <SegmentedSlider
                                className="shrink-0"
                                value={mode}
                                onChange={handleModeChange}
                                options={[
                                    { value: 'image', label: <><Icons.Image className="w-4 h-4" /> Изображение</> },
                                    { value: 'video', label: <><Icons.Camera className="w-4 h-4" /> Видео</> },
                                ]}
                            />
                        </div>

                        <PressButton
                            onClick={handleGenerate}
                            disabled={!prompt.trim() || busy}
                            className="void-tap-target w-10 h-10 shrink-0 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                            {busy ? <Icons.Spinner className="w-[18px] h-[18px] animate-spin" /> : <Icons.ArrowUp className="w-[18px] h-[18px]" />}
                        </PressButton>
                    </div>
                </div>

                {/* Ошибка генерации — единственный текст под полем ввода
                    (техническая обратная связь, показывается только при сбое). */}
                {error && (
                    <p className="text-sm text-red-500 font-semibold mt-3 text-center">{error}</p>
                )}

              </div>
            </div>

            {/* #8: полноэкранное окно генерации (как Grok) — для фото и видео.
                Пока идёт генерация — пульсирующий логотип + прогресс; по
                готовности — сам результат со «Скачать»/«Редактировать». */}
            {(activeVideo || imgFs) && (() => {
                const isVid = !!activeVideo;
                const status = isVid ? activeVideo.status : imgFs.status;
                const url = isVid ? activeVideo.url : imgFs.url;
                const err = isVid ? activeVideo.error : imgFs.error;
                const closeFs = () => { setActiveVideoId(null); setImgFs(null); };
                // #1: у видео фон остаётся чёрным (это видеоплеер), а у КАРТИНОК
                // окно теперь в тон приложения (светлое/тёмное по теме) — раньше
                // всё было чёрным и выглядело сломанным.
                const overlayBg = isVid ? 'bg-black' : 'bg-[#f8f9fc] dark:bg-darkBg';
                const closeBtnCls = isVid
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200';
                return (
                    <div className={`fixed inset-0 z-[80] ${overlayBg} flex flex-col items-center justify-center p-4 fade-in`}>
                        <PressButton onClick={closeFs} className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${closeBtnCls}`} title="Закрыть"><Icons.X className="w-5 h-5" /></PressButton>
                        {status === 'completed' ? (
                            isVid ? (
                                <div className="flex flex-col items-center gap-5 max-w-3xl w-full">
                                    <video src={url} controls autoPlay playsInline className="max-w-full max-h-[72vh] rounded-2xl bg-black" />
                                    <div className="flex items-center gap-3">
                                        <a href={url} download={`void-video-${Date.now()}.mp4`} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-colors"><Icons.Download className="w-4 h-4" /> Скачать</a>
                                        <PressButton onClick={() => editVideo(activeVideo)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 border border-white/20 transition-colors"><Icons.Pencil className="w-4 h-4" /> Редактировать</PressButton>
                                    </div>
                                </div>
                            ) : (
                                // #8: окно генерации фото в стиле Grok — картинка слева,
                                // панель редактирования справа (на телефоне — снизу).
                                <div className="w-full max-w-5xl flex flex-col md:flex-row items-stretch gap-4 md:gap-6">
                                    <div className="flex-1 min-w-0 flex items-center justify-center">
                                        <div className={`relative rounded-2xl overflow-hidden shadow-lg ${imgFs?.bgRemoved ? 'void-checkerboard' : ''}`}>
                                            <img src={url} alt={imgFs?.prompt || ''} className="max-w-full max-h-[74vh] object-contain" />
                                            {editBusy && (
                                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
                                                    <div className="void-gen-pulse"><Icons.VoidLogo className="w-16 h-16" /></div>
                                                    <p className="text-white/80 text-xs font-bold">{editBusy === 'bg' ? 'Удаляем фон…' : 'Создаём вариацию…'}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Правая панель редактирования — реальные действия */}
                                    <div className="w-full md:w-64 shrink-0 flex flex-col gap-2.5 bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder rounded-2xl p-3.5 self-start shadow-sm">
                                        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wide px-1 mb-0.5">Редактирование</p>
                                        <a href={url} download={`void-image-${Date.now()}.png`} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors"><Icons.Download className="w-4 h-4" /> Скачать PNG</a>
                                        <PressButton disabled={!!editBusy} onClick={removeBgFromFs} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 text-left"><Icons.Sparkles className="w-4 h-4 shrink-0" /> {imgFs?.bgRemoved ? 'Фон удалён' : 'Удалить фон'}</PressButton>
                                        <PressButton disabled={!!editBusy} onClick={regenerateFromFs} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 text-left"><Icons.Refresh className="w-4 h-4 shrink-0" /> Вариация</PressButton>
                                        <PressButton disabled={!!editBusy} onClick={editImageFromFs} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 text-left"><Icons.Pencil className="w-4 h-4 shrink-0" /> Изменить запрос</PressButton>
                                        {editErr && <p className="text-red-500 text-xs font-semibold px-1 pt-1">{editErr}</p>}
                                    </div>
                                </div>
                            )
                        ) : status === 'failed' ? (
                            <div className="flex flex-col items-center gap-3 text-center">
                                <Icons.Alert className="w-8 h-8 text-red-400" />
                                <p className={`font-semibold max-w-sm ${isVid ? 'text-red-300' : 'text-red-500'}`}>{err || 'Ошибка генерации'}</p>
                                <PressButton onClick={closeFs} className={`mt-2 px-5 py-2.5 rounded-full font-bold text-sm transition-colors ${isVid ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>Закрыть</PressButton>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-6">
                                <div className="void-gen-pulse"><Icons.VoidLogo className="w-24 h-24" /></div>
                                {isVid && (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-56 h-1.5 rounded-full bg-white/15 overflow-hidden">
                                            <div className="h-full bg-[#7c4dff] rounded-full" style={{ width: `${videoProgress}%`, transition: 'width 0.6s linear' }} />
                                        </div>
                                        <span className="text-white/80 text-sm font-bold tabular-nums">{videoProgress}%</span>
                                    </div>
                                )}
                                <p className={`text-sm font-semibold ${isVid ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>{isVid ? 'Генерируется видео…' : 'Генерируется изображение…'}</p>
                                <PressButton onClick={closeFs} className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${isVid ? 'bg-white/10 text-white/90 hover:bg-white/20 border border-white/15' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{isVid ? 'Свернуть' : 'Отмена'}</PressButton>
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
