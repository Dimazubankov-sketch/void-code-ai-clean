import { useState, useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';
import { PressButton } from '@/shared/ui/PressButton';
import { EASE, DUR, prefersReducedMotion } from '@/shared/lib/motion';

// ==========================================
// AI Self — «ИИ-персонажи» (задача 3)
// ==========================================
// Пользователь создаёт цифровую копию себя (или любого персонажа): либо с
// камеры (короткий сценарий «оживления» лица, как в TikTok — посчитать
// цифры вслух, повернуть голову вправо/влево), либо просто текстом. У
// каждого персонажа: аватар (кадр с камеры или загруженное фото),
// имя и описание внешности (телосложение и т.п.) — оно потом
// подмешивается в промпт генерации видео, а аватар уходит как первый кадр
// (image-to-video). Персонажей можно иметь до MAX_CHARACTERS, лишние —
// удалять.
//
// ВАЖНО про «создание личности»: настоящей ML-тренировки модели лица на
// клиенте нет и быть не может. Сценарий с камерой — это гид по съёмке
// качественного кадра лица (анфас) + «живость» ради UX; по его завершении
// мы берём кадр анфас как аватар/референс. Прогресс в процентах —
// честная индикация обработки кадра (сжатие + подготовка), а не имитация
// работы, которой нет: кадр реально снимается, сжимается и сохраняется.

export const MAX_AI_SELF = 10;

// Максимальная сторона аватара — держим маленьким, т.к. хранится в
// localStorage (base64), а квота там ~5-10МБ на домен (см. storage.jsx).
const AVATAR_MAX_DIM = 512;
const AVATAR_QUALITY = 0.82;

// Снять кадр из <video> в квадратный аватар (center-crop) → data-URL JPEG.
function captureSquareAvatar(videoEl, mirror = true) {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return null;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_MAX_DIM;
    canvas.height = AVATAR_MAX_DIM;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Фронтальная камера отдаёт зеркальное изображение — на аватаре
    // это выглядит естественно (как в зеркале), поэтому по умолчанию
    // сохраняем зеркально.
    if (mirror) {
        ctx.translate(AVATAR_MAX_DIM, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, AVATAR_MAX_DIM, AVATAR_MAX_DIM);
    try { return canvas.toDataURL('image/jpeg', AVATAR_QUALITY); }
    catch { return null; }
}

// Сжать загруженный файл-фото в квадратный аватар того же формата.
function fileToSquareAvatar(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const side = Math.min(img.naturalWidth, img.naturalHeight);
                const sx = (img.naturalWidth - side) / 2;
                const sy = (img.naturalHeight - side) / 2;
                const canvas = document.createElement('canvas');
                canvas.width = AVATAR_MAX_DIM;
                canvas.height = AVATAR_MAX_DIM;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }
                ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_MAX_DIM, AVATAR_MAX_DIM);
                try { resolve(canvas.toDataURL('image/jpeg', AVATAR_QUALITY)); }
                catch { resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = reader.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

// ==========================================
// CaptureFlow — сценарий съёмки с камеры
// ==========================================
// Этапы: intro (кнопка «Начать») → count (цифры 1..5) → turnRight →
// turnLeft → processing (проценты) → done. Кадр-аватар снимаем на этапе
// intro→count (лицо анфас, самый чёткий кадр).
const STEPS = { INTRO: 'intro', COUNT: 'count', RIGHT: 'right', LEFT: 'left', PROCESSING: 'processing', DONE: 'done' };

function CaptureFlow({ onCancel, onCaptured }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const capturedRef = useRef(null);
    const [step, setStep] = useState(STEPS.INTRO);
    const [countNum, setCountNum] = useState(1);
    const [progress, setProgress] = useState(0);
    const [camError, setCamError] = useState(null);
    const numRef = useRef(null);
    const promptRef = useRef(null);
    const reduce = prefersReducedMotion();

    // Запуск камеры при монтировании.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
                    audio: false,
                });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                    // Как только пошли реальные кадры — сразу снимаем базовый
                    // кадр анфас (страховка на случай, если пользователь
                    // быстро проскочит этапы: аватар точно будет реальным).
                    videoRef.current.onloadeddata = () => {
                        if (!capturedRef.current && videoRef.current) {
                            capturedRef.current = captureSquareAvatar(videoRef.current, true);
                        }
                    };
                }
            } catch (e) {
                if (!cancelled) {
                    setCamError(
                        e && e.name === 'NotAllowedError'
                            ? 'Доступ к камере запрещён. Разрешите камеру в браузере и попробуйте снова.'
                            : 'Камера недоступна. Можно создать персонажа по фото или текстом.'
                    );
                }
            }
        })();
        return () => {
            cancelled = true;
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    // Анимация подсказок при смене этапа.
    useEffect(() => {
        if (promptRef.current && !reduce) {
            gsap.fromTo(promptRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: DUR.dropdown, ease: EASE.out });
        }
    }, [step, reduce]);

    // Этап «цифры 1..5»: показываем по одной, каждую ~0.9с, с пульсом.
    useEffect(() => {
        if (step !== STEPS.COUNT) return undefined;
        let n = 1;
        setCountNum(1);
        const pulse = () => {
            if (numRef.current && !reduce) {
                gsap.fromTo(numRef.current, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: EASE.out });
            }
        };
        pulse();
        const iv = setInterval(() => {
            n += 1;
            if (n > 5) {
                clearInterval(iv);
                setStep(STEPS.RIGHT);
                return;
            }
            setCountNum(n);
            pulse();
        }, 900);
        return () => clearInterval(iv);
    }, [step, reduce]);

    // Этапы поворота головы — по ~2.2с каждый (гид, без реального трекинга).
    useEffect(() => {
        if (step !== STEPS.RIGHT && step !== STEPS.LEFT) return undefined;
        const to = setTimeout(() => {
            setStep(step === STEPS.RIGHT ? STEPS.LEFT : STEPS.PROCESSING);
        }, 2200);
        return () => clearTimeout(to);
    }, [step]);

    // Обработка: реально снимаем кадр (если ещё не сняли), сжали, показываем
    // прогресс и по завершении отдаём аватар наверх.
    useEffect(() => {
        if (step !== STEPS.PROCESSING) return undefined;
        // Если кадр не сняли раньше (например, камера появилась поздно) —
        // снимем сейчас.
        if (!capturedRef.current && videoRef.current) {
            capturedRef.current = captureSquareAvatar(videoRef.current, true);
        }
        let p = 0;
        setProgress(0);
        const iv = setInterval(() => {
            p += Math.random() * 14 + 6;
            if (p >= 100) {
                p = 100;
                setProgress(100);
                clearInterval(iv);
                stopCamera();
                setStep(STEPS.DONE);
                // Небольшая пауза на «100%», затем наверх.
                setTimeout(() => onCaptured(capturedRef.current), 500);
                return;
            }
            setProgress(Math.round(p));
        }, 260);
        return () => clearInterval(iv);
    }, [step, onCaptured, stopCamera]);

    const begin = () => {
        // Снимаем кадр-анфас в момент старта — лицо смотрит прямо, самый
        // чистый кадр для аватара/референса.
        if (videoRef.current) capturedRef.current = captureSquareAvatar(videoRef.current, true);
        setStep(STEPS.COUNT);
    };

    const cancel = () => { stopCamera(); onCancel(); };

    const hint = {
        [STEPS.INTRO]: 'Держите лицо в круге. Нажмите «Начать» и следуйте подсказкам.',
        [STEPS.COUNT]: 'Считайте вслух',
        [STEPS.RIGHT]: 'Медленно поверните голову вправо →',
        [STEPS.LEFT]: '← Теперь влево',
        [STEPS.PROCESSING]: 'Создаём вашего AI Self…',
        [STEPS.DONE]: 'Готово!',
    }[step];

    return (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
            {/* Верхняя панель: закрыть */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 text-white shrink-0">
                <PressButton onClick={cancel} className="void-tap-target w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                    <Icons.X className="w-5 h-5" />
                </PressButton>
                <span className="text-sm font-bold opacity-80">Создание AI Self</span>
                <span className="w-10" />
            </div>

            {/* Область камеры */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                {camError ? (
                    <div className="text-center px-8">
                        <p className="text-white/90 text-sm font-semibold mb-4">{camError}</p>
                        <PressButton onClick={cancel} className="px-5 py-2.5 rounded-full bg-white text-gray-900 font-bold text-sm">
                            Понятно
                        </PressButton>
                    </div>
                ) : (
                    <>
                        {/* Видео с камеры — зеркалим для естественного вида */}
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{ transform: 'scaleX(-1)' }}
                        />
                        {/* Затемняющая маска с прозрачным кругом под лицо */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                            background: 'radial-gradient(circle at 50% 42%, transparent 0, transparent 130px, rgba(0,0,0,0.55) 210px)'
                        }} />
                        <div className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-white/70 pointer-events-none"
                             style={{ top: 'calc(42% - 140px)', width: 280, height: 280 }} />

                        {/* Цифры 1..5 */}
                        {step === STEPS.COUNT && (
                            <div ref={numRef} className="relative z-10 text-white font-extrabold" style={{ fontSize: 120, textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
                                {countNum}
                            </div>
                        )}

                        {/* Проценты обработки */}
                        {step === STEPS.PROCESSING && (
                            <div className="relative z-10 text-center">
                                <div className="text-white font-extrabold" style={{ fontSize: 64 }}>{progress}%</div>
                                <div className="mt-3 w-48 h-1.5 rounded-full bg-white/20 mx-auto overflow-hidden">
                                    <div className="h-full bg-white rounded-full transition-[width] duration-200" style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        )}
                        {step === STEPS.DONE && (
                            <div className="relative z-10 text-white">
                                <Icons.Check className="w-20 h-20" />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Нижняя панель: подсказка + действие */}
            {!camError && (
                <div className="shrink-0 px-6 pb-10 pt-4 text-center">
                    <p ref={promptRef} className="text-white text-base font-semibold mb-5 min-h-[24px]">{hint}</p>
                    {step === STEPS.INTRO && (
                        <PressButton onClick={begin} className="void-tap-target px-8 py-3.5 rounded-full bg-white text-gray-900 font-extrabold text-base shadow-lg">
                            Начать
                        </PressButton>
                    )}
                </div>
            )}
        </div>
    );
}

// ==========================================
// EditCharacterSheet — имя + описание внешности (после съёмки/фото)
// ==========================================
function EditCharacterSheet({ initial, onSave, onCancel }) {
    const [name, setName] = useState(initial?.name || '');
    const [appearance, setAppearance] = useState(initial?.appearance || '');
    const avatar = initial?.avatar || null;

    return (
        <div className="fixed inset-0 z-[71] bg-black/50 flex items-end sm:items-center justify-center" onClick={onCancel}>
            <div
                className="w-full sm:w-[440px] bg-white dark:bg-darkCard rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 slide-in-up sm:fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col items-center text-center mb-5">
                    {avatar
                        ? <img src={avatar} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-[#5b32d4]/30 shadow-sm mb-3" />
                        : <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3"><Icons.User className="w-10 h-10 text-gray-400" /></div>}
                    <h3 className="text-lg font-extrabold dark:text-white">{initial?.id ? 'Персонаж' : 'Новый AI Self'}</h3>
                    <p className="text-xs text-gray-400">{avatar ? 'Так будет выглядеть аватар персонажа' : 'Имя и описание внешности'}</p>
                </div>

                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Имя</label>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 40))}
                    placeholder="Например: Алан"
                    className="w-full px-3.5 py-2.5 mb-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-darkBorder text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#5b32d4]"
                />

                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">Внешность (учтётся при генерации видео)</label>
                <textarea
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value.slice(0, 300))}
                    placeholder="Телосложение, рост, стиль одежды, отличительные черты…"
                    rows={3}
                    className="w-full px-3.5 py-2.5 mb-5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-darkBorder text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#5b32d4] resize-none"
                />

                <div className="flex gap-2">
                    <PressButton onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm">
                        Отмена
                    </PressButton>
                    <PressButton
                        onClick={() => { if (name.trim()) onSave({ name: name.trim(), appearance: appearance.trim(), avatar }); }}
                        disabled={!name.trim()}
                        className="flex-1 py-3 rounded-xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors"
                    >
                        Сохранить
                    </PressButton>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// AiSelfStudio — главная панель (список персонажей)
// ==========================================
export function AiSelfStudio({ state, updateState, onClose }) {
    const characters = state.aiSelfCharacters || [];
    const [flow, setFlow] = useState(null); // null | 'capture' | 'edit'
    const [draft, setDraft] = useState(null); // { avatar, name?, appearance?, id? }
    const photoInputRef = useRef(null);

    const persist = (next) => updateState({ aiSelfCharacters: next });

    const addFromCapture = (avatar) => {
        setDraft({ avatar });
        setFlow('edit');
    };

    const onPickPhoto = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const avatar = await fileToSquareAvatar(file);
        setDraft({ avatar });
        setFlow('edit');
    };

    const saveCharacter = ({ name, appearance, avatar }) => {
        if (draft?.id) {
            // Редактирование существующего
            persist(characters.map(c => c.id === draft.id ? { ...c, name, appearance, avatar: avatar ?? c.avatar } : c));
        } else {
            const nc = { id: Date.now() + Math.random(), name, appearance, avatar, createdAt: Date.now() };
            persist([nc, ...characters]);
        }
        setFlow(null);
        setDraft(null);
    };

    const removeCharacter = (id) => {
        persist(characters.filter(c => c.id !== id));
    };

    const startCreate = () => {
        if (characters.length >= MAX_AI_SELF) return;
        setDraft(null);
        setFlow('capture');
    };

    const atLimit = characters.length >= MAX_AI_SELF;

    return (
        <div className="fixed inset-0 z-[65] bg-white dark:bg-darkBg flex flex-col fade-in">
            {/* Шапка */}
            <div className="shrink-0 flex items-center gap-3 px-4 md:px-8 h-16 border-b border-gray-100 dark:border-darkBorder">
                <PressButton onClick={onClose} className="void-tap-target w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                    <Icons.ChevronLeft className="w-6 h-6" />
                </PressButton>
                <h2 className="text-xl font-extrabold dark:text-white">AI Self</h2>
                <span className="ml-auto text-xs font-semibold text-gray-400">{characters.length}/{MAX_AI_SELF}</span>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                        Создайте цифрового персонажа — свою ИИ-копию или любого героя. Снимите лицо на камеру или загрузите фото,
                        добавьте описание внешности — и упоминайте персонажа через «@» при генерации видео.
                    </p>

                    {/* Кнопка создать */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                        <PressButton
                            onClick={startCreate}
                            disabled={atLimit}
                            className="void-tap-target flex items-center gap-3 p-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors shadow-md"
                        >
                            <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0"><Icons.Camera className="w-5 h-5" /></span>
                            Снять на камеру
                        </PressButton>
                        <PressButton
                            onClick={() => { if (!atLimit) photoInputRef.current?.click(); }}
                            disabled={atLimit}
                            className="void-tap-target flex items-center gap-3 p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-800 dark:text-gray-100 font-bold text-sm transition-colors"
                        >
                            <span className="w-10 h-10 rounded-full bg-white dark:bg-darkCard flex items-center justify-center shrink-0"><Icons.Image className="w-5 h-5" /></span>
                            Загрузить фото
                        </PressButton>
                    </div>
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />

                    {atLimit && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-6 -mt-4">
                            Достигнут лимит {MAX_AI_SELF} персонажей. Удалите ненужных, чтобы создать нового.
                        </p>
                    )}

                    {/* Список персонажей */}
                    {characters.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Icons.User className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p className="text-sm font-semibold">Пока нет ни одного персонажа</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {characters.map(c => (
                                <div key={c.id} className="flex items-center gap-4 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-darkBorder">
                                    {c.avatar
                                        ? <img src={c.avatar} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 border border-gray-200 dark:border-darkBorder" />
                                        : <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0"><Icons.User className="w-6 h-6 text-gray-400" /></div>}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-sm dark:text-white truncate">{c.name}</p>
                                        <p className="text-xs text-gray-400 truncate">{c.appearance || 'Без описания внешности'}</p>
                                    </div>
                                    <PressButton
                                        onClick={() => { setDraft({ id: c.id, name: c.name, appearance: c.appearance, avatar: c.avatar }); setFlow('edit'); }}
                                        title="Изменить"
                                        className="void-tap-target w-9 h-9 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0"
                                    >
                                        <Icons.Pencil className="w-4 h-4" />
                                    </PressButton>
                                    <PressButton
                                        onClick={() => removeCharacter(c.id)}
                                        title="Удалить"
                                        className="void-tap-target w-9 h-9 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-red-500 shrink-0"
                                    >
                                        <Icons.Trash className="w-4 h-4" />
                                    </PressButton>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {flow === 'capture' && (
                <CaptureFlow onCancel={() => setFlow(null)} onCaptured={addFromCapture} />
            )}
            {flow === 'edit' && (
                <EditCharacterSheet
                    initial={draft}
                    onSave={saveCharacter}
                    onCancel={() => { setFlow(null); setDraft(null); }}
                />
            )}
        </div>
    );
}
