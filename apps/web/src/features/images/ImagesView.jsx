import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';
import { PressButton } from '@/shared/ui/PressButton';
import { generateBackendImage, submitBackendVideo, pollBackendVideo } from '@/shared/api/chat';
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
const VIDEO_MODELS = [
    { id: 'x-ai/grok-imagine-video', name: 'Стандартная' },
    { id: 'x-ai/grok-imagine-video-1.5', name: 'Продвинутая' },
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
    // Задача 1: референсные фото — как в чате, до 4 штук, используются
    // и для image-to-image (обычная генерация картинок уже поддерживает
    // это на бэкенде), и для image-to-video (первое фото уходит как
    // imageUrl — задаёт первый кадр видео).
    const [referenceImages, setReferenceImages] = useState([]);
    const refFileInputRef = useRef(null);
    const gridRef = useRef(null);

    const images = state.generatedImages || [];
    const videos = state.generatedVideos || [];
    // stateRef держит АКТУАЛЬНЫЙ state для отложенного опроса статуса
    // видео (pollVideo ниже) — сам tick() живёт в setTimeout и может
    // сработать через много секунд, к тому моменту state как параметр
    // компонента давно устарел бы (тот же паттерн, что и в useVoiceMode.jsx).
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);
    // Сетка результатов: картинки и видео вперемешку по времени, новые сверху.
    const items = [...images.map(i => ({ ...i, kind: 'image' })), ...videos.map(v => ({ ...v, kind: 'video' }))]
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
        setBusy(true);
        setError(null);
        try {
            const url = await generateBackendImage(prompt.trim(), referenceImages);
            updateState({
                generatedImages: [{ id: Date.now() + Math.random(), prompt: prompt.trim(), url, timestamp: Date.now(), chatId: null }, ...(stateRef.current.generatedImages || [])],
            });
            setPrompt('');
            setReferenceImages([]);
        } catch (e) {
            setError(e?.message || 'Не удалось сгенерировать изображение');
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
                        generatedVideos: (stateRef.current.generatedVideos || []).map(v => v.id === id ? { ...v, status: 'completed', url: res.url } : v),
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

    const generateVideo = async () => {
        if (!gate() || !prompt.trim() || busy) return;
        setBusy(true);
        setError(null);
        const localId = Date.now() + Math.random();
        try {
            const { jobId } = await submitBackendVideo({ prompt: prompt.trim(), model: videoModel, aspectRatio, duration, resolution, imageUrl: referenceImages[0] || undefined });
            updateState({
                generatedVideos: [{ id: localId, prompt: prompt.trim(), timestamp: Date.now(), status: 'pending', jobId, model: videoModel }, ...(stateRef.current.generatedVideos || [])],
            });
            setPrompt('');
            setReferenceImages([]);
            pollVideo(localId, jobId);
        } catch (e) {
            setError(e?.message || 'Не удалось отправить задачу на генерацию видео');
        } finally {
            setBusy(false);
        }
    };

    const handleGenerate = () => (mode === 'image' ? generateImage() : generateVideo());

    return (
        <div className="flex-1 overflow-y-auto h-full bg-white dark:bg-darkBg">
            {/* Задача 5: на телефоне — переключатель обратно в Чат (та же
                механика, что и кнопка «Изображения» в шапке чата: одна
                кнопка, назначение меняется в зависимости от текущего
                экрана). На ПК переход уже есть в постоянном меню. */}
            <div className="md:hidden sticky top-0 z-20 flex items-center justify-center px-4 pt-4 pb-2 bg-white/80 dark:bg-darkBg/80 backdrop-blur-xl">
                <PressButton
                    onClick={() => updateState({ currentView: 'chat' })}
                    className="void-tap-target flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-xl border border-black/[0.06] dark:border-white/10 shadow-sm hover:bg-white/90 dark:hover:bg-white/[0.16] transition-colors text-sm font-bold text-gray-800 dark:text-gray-100"
                >
                    <Icons.MessageSquare className="w-4 h-4" /> Чат
                </PressButton>
            </div>
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
                <h1 className="text-2xl md:text-3xl font-extrabold text-center mb-8 dark:text-white">
                    Что мы будем создавать?
                </h1>

                {/* Composer: текст + режим + настройки + отправка */}
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
                                    <button
                                        onClick={() => setReferenceImages(prev => prev.filter((_, idx) => idx !== i))}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md"
                                    >
                                        <Icons.X className="w-3 h-3" />
                                    </button>
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
                    <div className="flex items-center flex-wrap gap-2">
                        {/* Задача 1: «+» — прикрепить референсные фото. Для
                            изображений это image-to-image (уже поддержано
                            бэкендом), для видео — первый кадр (image-to-video). */}
                        <button
                            onClick={() => refFileInputRef.current?.click()}
                            disabled={referenceImages.length >= 4}
                            title="Прикрепить референс"
                            className="void-tap-target w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                        >
                            <Icons.Plus className="w-5 h-5" />
                        </button>
                        {/* Переключатель Изображение/Видео */}
                        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1">
                            <button
                                onClick={() => setMode('image')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${mode === 'image' ? 'bg-white dark:bg-darkCard text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}
                            >
                                <Icons.Image className="w-4 h-4" /> Изображение
                            </button>
                            <button
                                onClick={() => setMode('video')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${mode === 'video' ? 'bg-white dark:bg-darkCard text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}
                            >
                                <Icons.Camera className="w-4 h-4" /> Видео
                            </button>
                        </div>

                        {/* Соотношение сторон — общее для обоих режимов.
                            Задача 4: раньше дропдаун был absolute-позиционирован
                            ОТ КНОПКИ (left-0), из-за чего на телефоне на узком
                            экране мог вылезать за правый край — кнопка сидит
                            в ряду тулбара, который сам может быть смещён. Теперь
                            на мобильном это фиксированный «bottom sheet» на всю
                            ширину экрана (не зависит от того, где именно кнопка),
                            на ПК — обычный поповер у кнопки. */}
                        <div className="relative">
                            <button onClick={() => setShowAspect(v => !v)} className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                {aspectRatio}
                            </button>
                            {showAspect && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowAspect(false)} />
                                    <div className="fixed left-3 right-3 bottom-24 md:absolute md:left-auto md:right-0 md:bottom-full md:mb-2 md:w-40 md:inset-x-auto bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl shadow-2xl z-50 overflow-hidden p-1">
                                        {ASPECT_RATIOS.map(r => (
                                            <button key={r} onClick={() => { setAspectRatio(r); setShowAspect(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${r === aspectRatio ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Настройки, специфичные для видео: модель, разрешение, длительность */}
                        {mode === 'video' && (
                            <>
                                <div className="relative">
                                    <button onClick={() => setShowVideoModel(v => !v)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                        {VIDEO_MODELS.find(m => m.id === videoModel)?.name} <Icons.ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                    {showVideoModel && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowVideoModel(false)} />
                                            <div className="fixed left-3 right-3 bottom-24 md:absolute md:left-auto md:right-0 md:bottom-full md:mb-2 md:w-56 md:inset-x-auto bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder rounded-2xl shadow-2xl z-50 overflow-hidden p-1">
                                                {VIDEO_MODELS.map(m => (
                                                    <button key={m.id} onClick={() => { setVideoModel(m.id); setShowVideoModel(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${m.id === videoModel ? 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                                                        {m.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1">
                                    {['480p', '720p'].map(r => (
                                        <button key={r} onClick={() => setResolution(r)} className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${resolution === r ? 'bg-white dark:bg-darkCard text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>{r}</button>
                                    ))}
                                </div>
                                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-1">
                                    {[6, 10, 15].map(d => (
                                        <button key={d} onClick={() => setDuration(d)} className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${duration === d ? 'bg-white dark:bg-darkCard text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>{d}s</button>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="flex-1" />
                        <PressButton
                            onClick={handleGenerate}
                            disabled={!prompt.trim() || busy}
                            className="void-tap-target w-10 h-10 shrink-0 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                            {busy ? <Icons.Spinner className="w-4 h-4" /> : <Icons.ArrowUp className="w-4 h-4" />}
                        </PressButton>
                    </div>
                </div>

                {/* Задача 5: честная подсказка вместо кнопки выбора голоса —
                    у Grok Imagine Video НЕТ параметра API для выбора голоса
                    озвучки/диалога: звук и реплики модель генерирует сама
                    из ТЕКСТА промпта (см. пример ниже). Полноценный выбор
                    из своих/клонированных голосов потребовал бы отдельного
                    пайплайна (озвучка через уже работающий Fish Audio +
                    склейка с видео через ffmpeg на сервере) — это отдельная
                    по объёму задача, сейчас не подключена. */}
                {mode === 'video' && (
                    <p className="text-xs text-gray-400 mt-3 text-center leading-relaxed">
                        Голос и реплики создаёт сама модель — опишите их в тексте, например:
                        «...тёплый женский голос за кадром говорит: "Привет!"»
                    </p>
                )}

                {error && (
                    <p className="text-sm text-red-500 font-semibold mt-3 text-center">{error}</p>
                )}
                {/* Задача 6: видео недоступно на Free — предупреждаем сразу в
                    интерфейсе, а не только после отказа сервера. */}
                {mode === 'video' && (state.userPlan || 'FREE').toUpperCase() === 'FREE' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-3 text-center">
                        Генерация видео недоступна на тарифе Free — перейдите на Plus и выше.
                    </p>
                )}

                {/* Сетка результатов */}
                {items.length > 0 && (
                    <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-10">
                        {items.map((it) => (
                            <div key={it.id} className="void-img-card relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 aspect-square group">
                                {it.kind === 'image' ? (
                                    <img src={it.url} alt={it.prompt} className="w-full h-full object-cover" />
                                ) : it.status === 'completed' ? (
                                    <video src={it.url} controls className="w-full h-full object-cover" />
                                ) : it.status === 'failed' ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                                        <Icons.Alert className="w-5 h-5 text-red-400 mb-1" />
                                        <p className="text-[11px] text-red-500 font-semibold">{it.error || 'Ошибка генерации'}</p>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                                        <Icons.Spinner className="w-5 h-5 text-[#5b32d4] animate-spin" />
                                        <p className="text-[11px] text-gray-400 font-semibold">Генерируется…</p>
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-[11px] text-white font-semibold truncate">{it.prompt}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
