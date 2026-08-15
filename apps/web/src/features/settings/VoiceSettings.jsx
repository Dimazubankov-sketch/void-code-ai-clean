import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useOpenAiTts, useFishVoices } from '@/shared/lib/useOpenAiTts';
import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { VoiceOrb } from '@/features/settings/VoiceOrb';
import { EmotionSettings } from '@/features/settings/EmotionSettings';
import { CreateVoice } from '@/features/settings/CreateVoice';
import { useUserVoices } from '@/shared/lib/useUserVoices';
import { EMOTION_MODES, EMOTION_PRESETS, getEmotionSettings } from '@/shared/config/voiceEmotions';

// ==========================================
// VoiceSettings — раздел «Голос» в настройках
// ==========================================
// Перестроено в духе ChatGPT: единая свайпаемая карусель голосов (без
// деления на языки и без мужских голосов — один аккуратный набор женских
// тембров) + отдельная строка «Язык», которая открывает полноэкранный
// список языков с поиском наверху и алфавитной сортировкой по текущему
// языку интерфейса.

// Языки озвучки, доступные для выбора (независимо от того, какие голоса
// установлены в браузере — они лишь подсказывают Web Speech API, на каком
// языке произносить текст).
export const VOICE_LANGS = [
    { id: 'ru-RU', name: 'Русский' },
    { id: 'en-US', name: 'English (US)' },
    { id: 'en-GB', name: 'English (UK)' },
    { id: 'zh-CN', name: '中文' },
    { id: 'uk-UA', name: 'Українська' },
    { id: 'de-DE', name: 'Deutsch' },
    { id: 'fr-FR', name: 'Français' },
    { id: 'es-ES', name: 'Español' },
    { id: 'it-IT', name: 'Italiano' },
    { id: 'pt-PT', name: 'Português' },
    { id: 'tr-TR', name: 'Türkçe' },
    { id: 'ja-JP', name: '日本語' },
    { id: 'ko-KR', name: '한국어' },
    { id: 'ar-SA', name: 'العربية' },
];

// Шесть официальных голосов OpenAI TTS-1. Работают на любом языке
// (в т.ч. на русском), качественно и одинаково на любом устройстве.
// colorFrom/colorTo — только оформление под фирменную палитру Void Code.
export const VOICE_PRESETS = [
    { id: 'alloy',   name: 'Alloy',   desc: 'Универсальный, нейтральный', colorFrom: '#c4b5fd', colorTo: '#5b32d4' },
    { id: 'nova',    name: 'Nova',    desc: 'Женский, живой',              colorFrom: '#22d3ee', colorTo: '#5b32d4' },
    { id: 'shimmer', name: 'Shimmer', desc: 'Женский, мягкий',             colorFrom: '#93c5fd', colorTo: '#5b32d4' },
    { id: 'fable',   name: 'Fable',   desc: 'Женский, тёплый',             colorFrom: '#a78bfa', colorTo: '#5b32d4' },
    { id: 'echo',    name: 'Echo',    desc: 'Мужской, спокойный',          colorFrom: '#5eead4', colorTo: '#5b32d4' },
    { id: 'onyx',    name: 'Onyx',    desc: 'Мужской, глубокий',           colorFrom: '#3b82f6', colorTo: '#5b32d4' },
];

const SAMPLE = {
    'ru-RU': 'Привет! Так звучит выбранный голос.',
    'uk-UA': 'Привіт! Так звучить обраний голос.',
    'zh-CN': '你好！这就是所选语音的声音。',
    default: 'Hello! This is how the selected voice sounds.',
};

// Модели озвучки. Fish Audio S2.1 Pro — по умолчанию (задача явно требует
// именно это, в т.ч. для существующих пользователей без сохранённого
// выбора — см. App.jsx: state.ttsProvider фолбэчится на 'fish').
const TTS_MODELS = [
    { id: 'fish',   name: 'Fish Audio S2.1 Pro' },
    { id: 'openai', name: 'OpenAI TTS' },
];

// Палитра для карточек голосов Fish Audio — список голосов динамический
// (приходит с бэкенда, см. useFishVoices), поэтому цвета просто циклически
// переиспользуют ту же гамму, что и у пресетов OpenAI, вместо жёсткой
// привязки цвета к конкретному id голоса.
const FISH_COLOR_PALETTE = [
    { colorFrom: '#5eead4', colorTo: '#5b32d4' },
    { colorFrom: '#22d3ee', colorTo: '#5b32d4' },
    { colorFrom: '#93c5fd', colorTo: '#5b32d4' },
    { colorFrom: '#c4b5fd', colorTo: '#5b32d4' },
    { colorFrom: '#a78bfa', colorTo: '#5b32d4' },
    { colorFrom: '#3b82f6', colorTo: '#5b32d4' },
];

// «Голос по умолчанию» — используется, если список голосов Fish ещё
// грузится, недоступен, или пользователь явно ничего не выбирал: id пустой
// строкой, бэкенд в этом случае просто не передаёт reference_id в запрос
// к Fish Audio, что для их API валидно (голос модели по умолчанию).
const FISH_DEFAULT_VOICE = { id: '', name: 'Голос по умолчанию', desc: 'Fish Audio S2.1 Pro' };

// Полноэкранная модалка выбора языка озвучки: поиск сверху + список в
// столбик, отсортированный по алфавиту с учётом текущего языка интерфейса.
function VoiceLanguageModal({ uiLang, current, onChoose, onClose }) {
    const [query, setQuery] = useState('');
    const sorted = [...VOICE_LANGS].sort((a, b) => a.name.localeCompare(b.name, uiLang));
    const filtered = sorted.filter(l => l.name.toLowerCase().includes(query.trim().toLowerCase()));

    return (
        <div className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm h-[85vh] sm:h-[70vh] rounded-3xl shadow-2xl slide-in-right flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 p-5 pb-3 shrink-0">
                    <h4 className="font-extrabold text-lg dark:text-white flex-1">{t(uiLang, 'settings.voice')}</h4>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <div className="px-5 pb-3 shrink-0">
                    <div className="relative">
                        <Icons.Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={t(uiLang, 'common.search')}
                            className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {filtered.map(l => (
                        <button key={l.id} onClick={() => onChoose(l.id)} className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-colors ${current === l.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                            <span className="font-semibold text-sm dark:text-white">{l.name}</span>
                            {current === l.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                        </button>
                    ))}
                    {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Ничего не найдено</p>}
                </div>
            </div>
        </div>
    );
}

// Полноэкранная модалка выбора модели озвучки — та же механика, что и у
// VoiceLanguageModal (список + чекмарка у текущего выбора), но без поиска:
// пунктов всего два, искать среди них незачем.
function VoiceModelModal({ uiLang, current, onChoose, onClose }) {
    return (
        <div className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm rounded-3xl shadow-2xl slide-in-right flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 p-5 pb-3 shrink-0">
                    <h4 className="font-extrabold text-lg dark:text-white flex-1">Модель озвучки</h4>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <div className="px-3 pb-5">
                    {TTS_MODELS.map(m => (
                        <button key={m.id} onClick={() => onChoose(m.id)} className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-xl text-left transition-colors ${current === m.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                            <span className="font-semibold text-sm dark:text-white">{m.name}</span>
                            {current === m.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function VoiceSettings({ state, updateState, onClose }) {
    useLockBodyScroll();
    const tts = useOpenAiTts();
    const uiLang = state.lang || 'ru';
    const lang = state.voiceLang || 'ru-RU';
    const rate = state.voiceRate || 1;
    const [testing, setTesting] = useState(false);
    const [showLangModal, setShowLangModal] = useState(false);
    const [showModelModal, setShowModelModal] = useState(false);
    const [showEmotions, setShowEmotions] = useState(false);
    const [showCreateVoice, setShowCreateVoice] = useState(false);
    const { voices: myVoices, add: addMyVoice, remove: removeMyVoice } = useUserVoices();
    // Только что созданный голос подсвечиваем всплытием: список может быть
    // длинным, и без этого непонятно, что именно добавилось.
    const myVoicesRef = useRef(null);
    const prevMyCountRef = useRef(myVoices.length);
    useGSAP(() => {
        const grew = myVoices.length > prevMyCountRef.current;
        prevMyCountRef.current = myVoices.length;
        const first = myVoicesRef.current?.firstElementChild;
        if (!grew || !first) return;
        gsap.from(first, { y: -14, autoAlpha: 0, scale: 0.96, duration: 0.45, ease: 'back.out(1.7)', clearProps: 'all' });
    }, { dependencies: [myVoices.length] });

    const emo = getEmotionSettings(state);
    const emotionLabel = emo.mode === EMOTION_MODES.AUTO
        ? 'Автоматически'
        : (EMOTION_PRESETS.find((p) => p.id === emo.preset)?.name || 'Вручную');

    // Fish Audio S2.1 Pro — провайдер по умолчанию, в т.ч. для уже
    // существующих пользователей без сохранённого выбора (см. App.jsx).
    const provider = state.ttsProvider || 'fish';
    const { voices: fishVoices, loading: fishVoicesLoading } = useFishVoices();

    // Список голосов текущего провайдера. Для Fish он динамический
    // (приходит с бэкенда — см. useFishVoices) — пока грузится или если
    // Fish недоступен, показываем один пункт «Голос по умолчанию», чтобы
    // карусель никогда не оставалась пустой.
    const currentList = provider === 'openai'
        ? VOICE_PRESETS
        : ((fishVoices.length || myVoices.length)
            ? [
                // «Мои голоса» идут первыми — их немного и они самые нужные.
                ...myVoices.map((v, i) => ({ id: v.fishVoiceId, name: v.title, desc: 'Мой голос', myVoiceId: v.id, ...FISH_COLOR_PALETTE[i % FISH_COLOR_PALETTE.length] })),
                ...fishVoices.map((v, i) => ({ id: v.id, name: v.title, desc: v.description || 'Fish Audio', ...FISH_COLOR_PALETTE[(i + myVoices.length) % FISH_COLOR_PALETTE.length] })),
            ]
            : [FISH_DEFAULT_VOICE]);

    // Выбранный голос хранится ОТДЕЛЬНО для каждого провайдера
    // (voicePreset — для OpenAI, voicePresetFish — для Fish), поэтому при
    // переключении модели пользователь возвращается к своему последнему
    // выбору для неё, а не сбрасывается на первый голос в списке.
    const selectedVoiceId = provider === 'openai' ? (state.voicePreset || 'nova') : (state.voicePresetFish || currentList[0]?.id || '');
    const presetIdx = Math.max(0, currentList.findIndex(p => p.id === selectedVoiceId));
    const preset = currentList[presetIdx] || currentList[0];
    const langLabel = (VOICE_LANGS.find(l => l.id === lang) || VOICE_LANGS[0]).name;
    const modelLabel = (TTS_MODELS.find(m => m.id === provider) || TTS_MODELS[0]).name;

    const applyPreset = (idx) => {
        const list = currentList;
        const p = list[(idx + list.length) % list.length];
        // Сохраняем голос в поле, привязанное к текущему провайдеру — выбор
        // для другого провайдера при этом не трогаем.
        if (provider === 'openai') updateState({ voicePreset: p.id });
        else updateState({ voicePresetFish: p.id });
    };

    const selectProvider = (id) => {
        if (id === provider) return;
        tts.stop();
        setTesting(false);
        updateState({ ttsProvider: id });
    };

    // Свайп пальцем
    const touchStartX = useRef(null);
    const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
    const onTouchEnd = (e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx > 40) applyPreset(presetIdx - 1);
        else if (dx < -40) applyPreset(presetIdx + 1);
        touchStartX.current = null;
    };
    // Прокрутка колесом мыши
    const wheelLockRef = useRef(false);
    const onWheel = (e) => {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (wheelLockRef.current || Math.abs(delta) < 12) return;
        wheelLockRef.current = true;
        applyPreset(presetIdx + (delta > 0 ? 1 : -1));
        setTimeout(() => { wheelLockRef.current = false; }, 260);
    };

    const setVoiceLang = (id) => { updateState({ voiceLang: id }); setShowLangModal(false); };
    const chooseModel = (id) => { selectProvider(id); setShowModelModal(false); };

    const test = () => {
        const sample = SAMPLE[lang] || SAMPLE.default;
        setTesting(true);
        tts.speak(sample, { provider, voice: preset.id || undefined, speed: rate, lang });
    };

    // Раньше «активность» орба (testing) сбрасывалась жёстким setTimeout
    // 3с — для длинных фраз анимация обрывалась раньше, чем звук реально
    // заканчивался. Теперь testing синхронизирован с реальным состоянием
    // tts.speaking: как только звук по-настоящему закончился (onended) или
    // упал (onerror) — сбрасываем сразу, без фиксированной задержки.
    useEffect(() => {
        if (!testing) return;
        if (!tts.speaking && !tts.loading) {
            const t = setTimeout(() => setTesting(false), 200);
            return () => clearTimeout(t);
        }
    }, [testing, tts.speaking, tts.loading]);

    return (
        <div data-modal-overlay className="fixed inset-0 z-[100] bg-black/40 flex justify-end sm:items-center sm:justify-center fade-in" onClick={onClose}>
            <div className="w-full sm:w-[420px] h-full sm:h-auto sm:max-h-[85vh] bg-white dark:bg-darkCard shadow-2xl slide-in-right sm:rounded-3xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                    <h4 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.Volume2 className="w-5 h-5 text-[#5b32d4]" /> {t(uiLang, 'settings.voice')}</h4>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-8">
                    {tts.error && tts.error !== 'Не удалось воспроизвести аудио' && (
                        <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
                            {tts.error}
                        </div>
                    )}

                    {/* Модель озвучки: одна строка-кнопка вместо грид-переключателя —
                        открывает список из двух моделей (Fish Audio S2.1 Pro / OpenAI TTS).
                        По умолчанию выбран Fish Audio. Переключение сразу меняет список
                        голосов ниже — у каждой модели свой набор и свой последний
                        выбранный голос (см. selectedVoiceId). */}
                    <button onClick={() => setShowModelModal(true)} className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Volume2 className="w-4 h-4" /></div>
                            <span className="font-bold text-sm dark:text-white">Модель</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-gray-400">
                            {modelLabel} <Icons.ChevronRight className="w-4 h-4" />
                        </span>
                    </button>

                    {/* Свайпаемая карусель голоса — единая для всех языков, набор
                        голосов зависит от выбранной модели озвучки (provider) выше. */}
                    <div
                        className="select-none"
                        onTouchStart={onTouchStart}
                        onTouchEnd={onTouchEnd}
                        onWheel={onWheel}
                    >
                        <div className="flex items-center justify-center gap-4">
                            <button onClick={() => applyPreset(presetIdx - 1)} className="p-2 rounded-full text-gray-300 hover:text-[#5b32d4] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"><Icons.ChevronLeft className="w-6 h-6" /></button>
                            <div className="flex flex-col items-center gap-3">
                                <VoiceOrb
                                    colorFrom={preset.colorFrom}
                                    colorTo={preset.colorTo}
                                    size={128}
                                    /* speaking только когда звук РЕАЛЬНО играет;
                                       пока идёт запрос — thinking, при ошибке
                                       tts сам сбросит speaking и орб вернётся
                                       в idle, зависнуть в speaking нельзя. */
                                    state={tts.speaking ? 'speaking' : tts.loading ? 'thinking' : 'idle'}
                                />
                                <div className="text-center">
                                    <p className="font-extrabold text-lg dark:text-white">{preset.name}</p>
                                    <p className="text-xs text-gray-400">{preset.desc}</p>
                                </div>
                            </div>
                            <button onClick={() => applyPreset(presetIdx + 1)} className="p-2 rounded-full text-gray-300 hover:text-[#5b32d4] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"><Icons.ChevronRight className="w-6 h-6" /></button>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 mt-4">
                            {currentList.map((p, i) => (
                                <button key={p.id || 'default'} onClick={() => applyPreset(i)} className={`rounded-full transition-all ${i === presetIdx ? 'w-4 h-1.5 bg-[#5b32d4]' : 'w-1.5 h-1.5 bg-gray-300 dark:bg-gray-700'}`} />
                            ))}
                        </div>
                        {provider === 'fish' && fishVoicesLoading && (
                            <p className="text-center text-xs text-gray-400 mt-2">Загружаю голоса Fish Audio…</p>
                        )}
                    </div>

                    {/* Создание своего голоса: клон по записи или генерация по
                        описанию. Доступность и суточный лимит проверяет сервер —
                        здесь кнопка есть всегда, а неоплаченный тариф увидит
                        объяснение внутри. */}
                    <button onClick={() => setShowCreateVoice(true)} className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Mic className="w-4 h-4" /></div>
                            <span className="font-bold text-sm dark:text-white">Создать голос</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-gray-400">
                            Клон или описание <Icons.ChevronRight className="w-4 h-4" />
                        </span>
                    </button>

                    {/* Мои голоса — с возможностью удалить. */}
                    {myVoices.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">Мои голоса</p>
                            <div ref={myVoicesRef} className="space-y-1.5">
                                {myVoices.map((v) => (
                                    <div key={v.id} className="flex items-center justify-between px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60">
                                        <button onClick={() => updateState({ ttsProvider: 'fish', voicePresetFish: v.fishVoiceId })} className="flex-1 text-left min-w-0">
                                            <span className="block font-bold text-sm dark:text-white truncate">{v.title}</span>
                                            <span className="block text-[11px] text-gray-400">{v.source === 'clone' ? 'Клонированный' : 'Сгенерированный'}</span>
                                        </button>
                                        <button
                                            onClick={() => removeMyVoice(v.id).catch(() => { /* уже удалён — не мешаем */ })}
                                            title="Удалить голос"
                                            className="void-tap-target p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
                                        >
                                            <Icons.Trash className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Эмоции и тон голоса. Общий компонент с голосовыми
                        настройками Voice Mode — второй реализации нет. */}
                    <button onClick={() => setShowEmotions(true)} className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Sparkles className="w-4 h-4" /></div>
                            <span className="font-bold text-sm dark:text-white">Эмоции</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-gray-400">
                            {emotionLabel} <Icons.ChevronRight className="w-4 h-4" />
                        </span>
                    </button>

                    {/* Язык — одна строка, открывает модалку со списком и поиском */}
                    <button onClick={() => setShowLangModal(true)} className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center"><Icons.Globe className="w-4 h-4" /></div>
                            <span className="font-bold text-sm dark:text-white">Язык озвучки</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-gray-400">
                            {langLabel} <Icons.ChevronRight className="w-4 h-4" />
                        </span>
                    </button>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={test} disabled={testing || tts.loading} className="w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        <Icons.Volume2 className="w-4 h-4" /> {tts.loading ? 'Генерирую…' : testing ? 'Проигрываю…' : 'Проверить голос'}
                    </button>
                </div>
            </div>

            {showLangModal && (
                <VoiceLanguageModal uiLang={uiLang} current={lang} onChoose={setVoiceLang} onClose={() => setShowLangModal(false)} />
            )}
            {showCreateVoice && (
                <CreateVoice
                    updateState={updateState}
                    onClose={() => setShowCreateVoice(false)}
                    onCreated={(v) => { addMyVoice(v); updateState({ ttsProvider: 'fish', voicePresetFish: v.fishVoiceId }); }}
                />
            )}
            {showEmotions && (
                <EmotionSettings state={state} updateState={updateState} onClose={() => setShowEmotions(false)} />
            )}
            {showModelModal && (
                <VoiceModelModal uiLang={uiLang} current={provider} onChoose={chooseModel} onClose={() => setShowModelModal(false)} />
            )}
        </div>
    );
}
