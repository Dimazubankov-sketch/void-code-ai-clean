import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { ApiError } from '@/shared/api/client';
import { cloneVoice, designVoicePreview, designVoiceSave, getVoiceQuota } from '@/shared/api/voices';

// ==========================================
// CreateVoice — единый экран создания голоса
// ==========================================
// Один компонент на оба входа (Настройки → Голос и Voice Mode →
// Голосовые настройки), второй реализации нет.
//
// Два официально поддерживаемых Fish способа:
//   • Клонирование — запись/файл до 30 секунд превращается в модель.
//   • Генерация по описанию — Voice Design возвращает варианты, из
//     выбранного создаётся постоянный голос.
//
// Подписка и суточные лимиты проверяются НА СЕРВЕРЕ. Здесь квота нужна
// только чтобы заранее показать нужный экран, а не чтобы что-то решать:
// при создании сервер проверит всё заново.

const PANEL = 'w-full h-full bg-white dark:bg-[#0d0819] flex flex-col md:w-[560px] md:h-[600px] md:rounded-3xl md:shadow-2xl md:overflow-hidden';
const MAX_RECORD_MS = 30_000;

export const CONSENT_TEXT =
    'Я подтверждаю, что это мой голос / у меня есть все права на этот голос, ' +
    'и я разрешаю Void Code использовать его для синтеза речи в рамках моего аккаунта.';

const CLONING_WARNING_TEXT =
    'Запрещено клонировать чужие голоса, голоса публичных персон и персонажей ' +
    'без документального разрешения правообладателя.';

// Метка синтетической речи — по умолчанию видна везде, где звучит
// сгенерированный голос: в превью при создании и в плеере озвучки.
export function SyntheticBadge({ className = '' }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-white/60 ${className}`}>
            <Icons.Sparkles className="w-3 h-3" />
            Синтетическая речь
        </span>
    );
}

// Правила + согласие. Общий блок для обоих способов создания, чтобы
// формулировки нигде не разошлись.
function ConsentBlock({ checked, onChange, onOpenLegal }) {
    return (
        <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20">
                <p className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed">{CLONING_WARNING_TEXT}</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? 'bg-[#5b32d4] border-[#5b32d4] text-white' : 'border-gray-300 dark:border-white/25'}`}>
                    {checked && <Icons.Check className="w-3 h-3" />}
                </span>
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="hidden" />
                <span className="text-xs text-gray-600 dark:text-white/70 leading-relaxed">{CONSENT_TEXT}</span>
            </label>
            <p className="text-[11px] text-gray-400">
                Продолжая, вы принимаете{' '}
                <button onClick={() => onOpenLegal('terms')} className="text-[#5b32d4] font-semibold underline">Условия пользования</button>
                {' '}и{' '}
                <button onClick={() => onOpenLegal('privacy')} className="text-[#5b32d4] font-semibold underline">Политику конфиденциальности</button>.
            </p>
        </div>
    );
}

// Тестовый текст для записи — один и тот же по смыслу на разных языках,
// чтобы пользователь читал привычную ему речь: на родном языке дикция
// естественнее, а значит и клон получается точнее.
const READING_TEXTS = [
    { id: 'ru', name: 'Русский', text: 'Меня зовут так, как я привык представляться. Сегодня хорошая погода, и я спокойно читаю этот текст обычным голосом, не торопясь и не играя интонацией. Один, два, три, четыре, пять — я говорю ровно и разборчиво.' },
    { id: 'en', name: 'English', text: 'This is my natural speaking voice, calm and unhurried. I am reading this short passage clearly, without acting or changing my tone. One, two, three, four, five — I speak evenly and distinctly.' },
    { id: 'de', name: 'Deutsch', text: 'Das ist meine natürliche Stimme, ruhig und gelassen. Ich lese diesen kurzen Text deutlich vor, ohne zu schauspielern. Eins, zwei, drei, vier, fünf — ich spreche gleichmäßig und klar.' },
    { id: 'es', name: 'Español', text: 'Esta es mi voz natural, tranquila y sin prisa. Leo este texto con claridad, sin actuar ni cambiar el tono. Uno, dos, tres, cuatro, cinco — hablo de forma pareja y clara.' },
    { id: 'zh', name: '中文', text: '这是我平常说话的声音，平静而放松。我正在清楚地朗读这段短文，没有表演，也没有改变语调。一、二、三、四、五——我说得均匀而清晰。' },
];

function Header({ title, onBack }) {
    return (
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 shrink-0">
            <button onClick={onBack} className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white">
                <Icons.ChevronLeft className="w-5 h-5" />
            </button>
            <h4 className="flex-1 text-center font-extrabold text-gray-900 dark:text-white">{title}</h4>
            <div className="w-10 shrink-0" />
        </div>
    );
}

// ---- Экран «нужна подписка» ----
function Paywall({ onClose, onUpgrade }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-3xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center mb-5">
                <Icons.Sparkles className="w-8 h-8" />
            </div>
            <h4 className="font-extrabold text-xl text-gray-900 dark:text-white mb-2">Создание своего голоса</h4>
            <p className="text-sm text-gray-500 dark:text-white/60 leading-relaxed mb-7 max-w-xs">
                Это платная возможность. Склонируйте собственный голос по короткой записи или создайте новый по описанию — и используйте его и в озвучке сообщений, и в голосовом режиме.
            </p>
            <button onClick={onUpgrade} className="void-tap-target w-full max-w-xs py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors mb-2.5">
                Выбрать тариф
            </button>
            <button onClick={onClose} className="void-tap-target w-full max-w-xs py-3 rounded-2xl text-gray-500 dark:text-white/50 font-semibold text-sm">
                Не сейчас
            </button>
        </div>
    );
}

// ---- Индикатор этапов: Загрузка → Обработка → Создание → Готово ----
function Progress({ stage }) {
    const stages = ['Загрузка', 'Обработка', 'Создание голоса', 'Готово'];
    const idx = stages.indexOf(stage);
    const listRef = useRef(null);

    // Список этапов выезжает по очереди при первом показе, а активная
    // строка мягко подсвечивается при каждой смене этапа — процесс
    // «живой», и видно, что он не завис.
    useGSAP(() => {
        if (!listRef.current) return;
        gsap.from(listRef.current.children, { x: -12, autoAlpha: 0, duration: 0.3, ease: 'power2.out', stagger: 0.08, clearProps: 'all' });
    }, { scope: listRef });

    useGSAP(() => {
        const active = listRef.current?.children?.[idx];
        if (!active) return;
        gsap.fromTo(active, { scale: 0.97 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' });
    }, { dependencies: [idx] });

    return (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div ref={listRef} className="w-full max-w-xs space-y-3">
                {stages.map((st, i) => (
                    <div key={st} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${i < idx ? 'bg-[#5b32d4] text-white' : i === idx ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4]' : 'bg-gray-100 dark:bg-white/10 text-gray-300'}`}>
                            {i < idx ? <Icons.Check className="w-3.5 h-3.5" /> : i === idx ? <Icons.Spinner className="w-3.5 h-3.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                        </span>
                        <span className={`text-sm font-semibold ${i <= idx ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{st}</span>
                    </div>
                ))}
            </div>
            <p className="text-xs text-gray-400 mt-6 text-center">Обучение модели занимает до минуты — не закрывайте экран</p>
        </div>
    );
}

// ---- Клонирование ----
function CloneScreen({ onBack, onCreated, onOpenLegal }) {
    const [langId, setLangId] = useState('ru');
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [audio, setAudio] = useState(null); // data-URL
    const [title, setTitle] = useState('');
    const [stage, setStage] = useState(null);
    const [error, setError] = useState(null);
    const [consent, setConsent] = useState(false);

    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const streamRef = useRef(null);

    const text = READING_TEXTS.find((t) => t.id === langId) || READING_TEXTS[0];

    const stopRecording = () => {
        try { recorderRef.current?.stop(); } catch { /* noop */ }
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecording(false);
    };

    useEffect(() => () => stopRecording(), []);

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } });
            streamRef.current = stream;
            const rec = new MediaRecorder(stream);
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
            rec.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
                const reader = new FileReader();
                reader.onload = () => setAudio(reader.result);
                reader.readAsDataURL(blob);
            };
            rec.start();
            recorderRef.current = rec;
            setRecording(true);
            setElapsed(0);
            const startedAt = Date.now();
            timerRef.current = setInterval(() => {
                const ms = Date.now() - startedAt;
                setElapsed(ms);
                // Жёсткая отсечка на 30 секундах — дальше Fish всё равно не
                // использует, а вес запроса растёт.
                if (ms >= MAX_RECORD_MS) stopRecording();
            }, 100);
        } catch {
            setError('Нет доступа к микрофону');
        }
    };

    const onFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('audio/')) { setError('Нужен аудиофайл'); return; }
        const reader = new FileReader();
        reader.onload = () => { setAudio(reader.result); setError(null); };
        reader.readAsDataURL(file);
    };

    const submit = async () => {
        if (!audio || !title.trim() || !consent || stage) return;
        setError(null);
        try {
            setStage('Загрузка');
            await new Promise((r) => setTimeout(r, 250));
            setStage('Обработка');
            const created = await cloneVoice(title.trim(), audio, consent);
            setStage('Готово');
            onCreated(created);
        } catch (e) {
            setStage(null);
            setError(e instanceof ApiError ? e.message : 'Не удалось создать голос');
        }
    };

    if (stage) return (<><Header title="Клонирование голоса" onBack={onBack} /><Progress stage={stage} /></>);

    return (
        <>
            <Header title="Клонирование голоса" onBack={onBack} />
            <div className="flex-1 overflow-y-auto void-no-scrollbar px-4 md:px-6 pb-8 space-y-5">
                <p className="text-xs text-gray-400 leading-relaxed">
                    Запишите до 30 секунд речи в тихом помещении. Читайте ровно и обычным голосом — не играйте интонацией: клон повторит именно то, как вы звучите на записи.
                </p>

                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Язык записи</p>
                    <div className="flex gap-2 overflow-x-auto void-no-scrollbar pb-1">
                        {READING_TEXTS.map((t) => (
                            <button key={t.id} onClick={() => setLangId(t.id)} className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${langId === t.id ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/80'}`}>
                                {t.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-white/[0.04] text-[15px] leading-relaxed text-gray-800 dark:text-white/85">
                    {text.text}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={recording ? stopRecording : startRecording}
                        className={`void-tap-target flex-1 py-3.5 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${recording ? 'bg-red-500 text-white' : 'bg-[#5b32d4] hover:bg-[#4a26b0] text-white'}`}
                    >
                        {recording ? <Icons.Square className="w-4 h-4" /> : <Icons.Mic className="w-4 h-4" />}
                        {recording ? `Остановить · ${(elapsed / 1000).toFixed(1)}с` : audio ? 'Записать заново' : 'Записать'}
                    </button>
                    <label className="void-tap-target px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white font-bold text-sm cursor-pointer">
                        Файл
                        <input type="file" accept="audio/*" className="hidden" onChange={onFile} />
                    </label>
                </div>

                {audio && !recording && (
                    <div className="space-y-3 fade-in">
                        <audio src={audio} controls className="w-full" />
                        <ConsentBlock checked={consent} onChange={setConsent} onOpenLegal={onOpenLegal} />
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                            placeholder="Название голоса, например «Мой голос»"
                            className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4]"
                        />
                        <button
                            onClick={submit}
                            disabled={!title.trim() || !consent}
                            className="void-tap-target w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-white/10 disabled:text-gray-400 text-white font-bold text-sm transition-colors"
                        >
                            Создать голос
                        </button>
                    </div>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
        </>
    );
}

// ---- Генерация по описанию ----
function DesignScreen({ onBack, onCreated, onOpenLegal }) {
    const [instruction, setInstruction] = useState('');
    const [candidates, setCandidates] = useState(null);
    const [chosen, setChosen] = useState(0);
    const [title, setTitle] = useState('');
    const [stage, setStage] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [consent, setConsent] = useState(false);

    const generate = async () => {
        if (instruction.trim().length < 3 || busy) return;
        setBusy(true); setError(null); setCandidates(null);
        try {
            const items = await designVoicePreview(instruction.trim(), 'Привет! Это пример звучания моего голоса.', 'ru');
            setCandidates(items);
            setChosen(0);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Не удалось сгенерировать голос');
        } finally { setBusy(false); }
    };

    const save = async () => {
        if (!candidates || !title.trim() || !consent || stage) return;
        setError(null);
        try {
            setStage('Загрузка');
            await new Promise((r) => setTimeout(r, 200));
            setStage('Создание голоса');
            const created = await designVoiceSave(title.trim(), candidates[chosen].audioBase64, instruction.trim(), consent);
            setStage('Готово');
            onCreated(created);
        } catch (e) {
            setStage(null);
            setError(e instanceof ApiError ? e.message : 'Не удалось сохранить голос');
        }
    };

    if (stage) return (<><Header title="Генерация голоса" onBack={onBack} /><Progress stage={stage} /></>);

    return (
        <>
            <Header title="Генерация голоса" onBack={onBack} />
            <div className="flex-1 overflow-y-auto void-no-scrollbar px-4 md:px-6 pb-8 space-y-4">
                <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value.slice(0, 800))}
                    rows={5}
                    placeholder="Опишите голос, который хотите создать: мужской, 30 лет, спокойный, глубокий, уверенный, дружелюбный…"
                    className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4] resize-none"
                />
                <button
                    onClick={generate}
                    disabled={instruction.trim().length < 3 || busy}
                    className="void-tap-target w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-white/10 disabled:text-gray-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                    {busy && <Icons.Spinner className="w-4 h-4" />}
                    {busy ? 'Генерирую варианты…' : candidates ? 'Сгенерировать заново' : 'Сгенерировать'}
                </button>

                {candidates && (
                    <div className="space-y-3 fade-in">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Выберите вариант</p>
                            <SyntheticBadge />
                        </div>
                        {candidates.map((c, i) => (
                            <button
                                key={i}
                                onClick={() => setChosen(i)}
                                className={`w-full p-3 rounded-2xl text-left transition-colors ${chosen === i ? 'bg-[#efecf9] dark:bg-purple-900/20 ring-2 ring-[#5b32d4]' : 'bg-gray-100 dark:bg-white/[0.06]'}`}
                            >
                                <span className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">Вариант {i + 1}</span>
                                    {chosen === i && <Icons.Check className="w-4 h-4 text-[#5b32d4]" />}
                                </span>
                                <audio
                                    src={`data:audio/wav;base64,${c.audioBase64}`}
                                    controls
                                    className="w-full"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </button>
                        ))}
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                            placeholder="Название голоса, например «Сара»"
                            className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4]"
                        />
                        <ConsentBlock checked={consent} onChange={setConsent} onOpenLegal={onOpenLegal} />
                        <button
                            onClick={save}
                            disabled={!title.trim() || !consent}
                            className="void-tap-target w-full py-3.5 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-white/10 disabled:text-gray-400 text-white font-bold text-sm transition-colors"
                        >
                            Сохранить голос
                        </button>
                    </div>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
        </>
    );
}

export function CreateVoice({ updateState, onClose, onCreated }) {
    const openLegal = (section) => { onClose(); updateState({ currentView: 'info', infoSection: section }); };
    const [mode, setMode] = useState(null); // 'clone' | 'design'
    const [quota, setQuota] = useState(null);
    const scope = useRef(null);

    useEffect(() => {
        let alive = true;
        getVoiceQuota().then((q) => { if (alive) setQuota(q); }).catch(() => { if (alive) setQuota({ allowed: false }); });
        return () => { alive = false; };
    }, []);

    useGSAP(() => {
        gsap.from('.cv-anim', { y: 18, autoAlpha: 0, duration: 0.34, ease: 'power2.out', stagger: 0.07, clearProps: 'all' });
    }, { scope, dependencies: [mode, quota?.allowed] });

    const handleCreated = (voice) => { onCreated?.(voice); onClose(); };

    return (
        <div className="fixed inset-0 z-[265] md:bg-black/40 md:backdrop-blur-sm flex md:items-center md:justify-center fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={scope} className={PANEL} onClick={(e) => e.stopPropagation()}>
                {quota === null ? (
                    <><Header title="Создать голос" onBack={onClose} /><div className="flex-1 flex items-center justify-center"><Icons.Spinner className="w-6 h-6 text-[#5b32d4]" /></div></>
                ) : !quota.allowed ? (
                    <><Header title="Создать голос" onBack={onClose} />
                        <Paywall onClose={onClose} onUpgrade={() => { onClose(); updateState({ currentView: 'pricing' }); }} /></>
                ) : mode === 'clone' ? (
                    <CloneScreen onBack={() => setMode(null)} onCreated={handleCreated} onOpenLegal={openLegal} />
                ) : mode === 'design' ? (
                    <DesignScreen onBack={() => setMode(null)} onCreated={handleCreated} onOpenLegal={openLegal} />
                ) : (
                    <>
                        <Header title="Создать голос" onBack={onClose} />
                        <div className="flex-1 overflow-y-auto void-no-scrollbar px-4 md:px-6 pb-8 space-y-3">
                            {quota.limit > 0 && (
                                <p className="cv-anim text-xs text-gray-400">
                                    Сегодня доступно: {quota.remaining} из {quota.limit}
                                </p>
                            )}
                            <button onClick={() => setMode('clone')} className="cv-anim w-full text-left p-4 rounded-2xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                                <span className="flex items-center gap-3 mb-1.5">
                                    <span className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Mic className="w-4 h-4" /></span>
                                    <span className="font-bold text-[15px] text-gray-900 dark:text-white">Клонирование голоса</span>
                                </span>
                                <span className="block text-xs text-gray-500 dark:text-white/50 leading-relaxed">Создайте цифровую копию своего голоса с помощью короткой записи.</span>
                            </button>
                            <button onClick={() => setMode('design')} className="cv-anim w-full text-left p-4 rounded-2xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                                <span className="flex items-center gap-3 mb-1.5">
                                    <span className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Sparkles className="w-4 h-4" /></span>
                                    <span className="font-bold text-[15px] text-gray-900 dark:text-white">Генерация голоса</span>
                                </span>
                                <span className="block text-xs text-gray-500 dark:text-white/50 leading-relaxed">Опишите голос, который хотите создать, и система сгенерирует подходящий голос.</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
