import { useRef, useState } from 'react';
import { useOpenAiTts } from '@/shared/lib/useOpenAiTts';
import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { VoiceOrb } from '@/features/settings/VoiceOrb';

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

// Полноэкранная модалка выбора языка озвучки: поиск сверху + список в
// столбик, отсортированный по алфавиту с учётом текущего языка интерфейса.
function VoiceLanguageModal({ uiLang, current, onChoose, onClose }) {
    const [query, setQuery] = useState('');
    const sorted = [...VOICE_LANGS].sort((a, b) => a.name.localeCompare(b.name, uiLang));
    const filtered = sorted.filter(l => l.name.toLowerCase().includes(query.trim().toLowerCase()));

    return (
        <div className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-sm h-[85vh] sm:h-[70vh] rounded-t-3xl sm:rounded-3xl shadow-2xl slide-in-right flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
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

export function VoiceSettings({ state, updateState, onClose }) {
    useLockBodyScroll();
    const tts = useOpenAiTts();
    const uiLang = state.lang || 'ru';
    const lang = state.voiceLang || 'ru-RU';
    const rate = state.voiceRate || 1;
    const [testing, setTesting] = useState(false);
    const [showLangModal, setShowLangModal] = useState(false);

    const presetIdx = Math.max(0, VOICE_PRESETS.findIndex(p => p.id === (state.voicePreset || 'nova')));
    const preset = VOICE_PRESETS[presetIdx] || VOICE_PRESETS[0];
    const langLabel = (VOICE_LANGS.find(l => l.id === lang) || VOICE_LANGS[0]).name;

    const applyPreset = (idx) => {
        const p = VOICE_PRESETS[(idx + VOICE_PRESETS.length) % VOICE_PRESETS.length];
        // Для OpenAI TTS сохраняем только id голоса — pitch/URI больше не нужны.
        updateState({ voicePreset: p.id });
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

    const test = () => {
        const sample = SAMPLE[lang] || SAMPLE.default;
        setTesting(true);
        tts.speak(sample, { voice: preset.id, speed: rate, lang });
        // Отпускаем «активность» орба через 3с если аудио короче,
        // а onEnded самой TTS сбросит speaking сам.
        setTimeout(() => setTesting(false), 3000);
    };

    return (
        <div data-modal-overlay className="fixed inset-0 z-[100] bg-black/40 flex justify-end sm:items-center sm:justify-center fade-in" onClick={onClose}>
            <div className="w-full sm:w-[420px] h-full sm:h-auto sm:max-h-[85vh] bg-white dark:bg-darkCard shadow-2xl slide-in-right sm:rounded-3xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                    <h4 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.Volume2 className="w-5 h-5 text-[#5b32d4]" /> {t(uiLang, 'settings.voice')}</h4>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-8">
                    {tts.error && (
                        <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
                            {tts.error}
                        </div>
                    )}

                    {/* Свайпаемая карусель голоса — единая для всех языков */}
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
                                    active={testing}
                                    size={128}
                                    audioElement={testing ? (tts.audioRef?.current || null) : null}
                                />
                                <div className="text-center">
                                    <p className="font-extrabold text-lg dark:text-white">{preset.name}</p>
                                    <p className="text-xs text-gray-400">{preset.desc}</p>
                                </div>
                            </div>
                            <button onClick={() => applyPreset(presetIdx + 1)} className="p-2 rounded-full text-gray-300 hover:text-[#5b32d4] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"><Icons.ChevronRight className="w-6 h-6" /></button>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 mt-4">
                            {VOICE_PRESETS.map((p, i) => (
                                <button key={p.id} onClick={() => applyPreset(i)} className={`rounded-full transition-all ${i === presetIdx ? 'w-4 h-1.5 bg-[#5b32d4]' : 'w-1.5 h-1.5 bg-gray-300 dark:bg-gray-700'}`} />
                            ))}
                        </div>
                    </div>

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

                    {/* Скорость */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Скорость: {rate.toFixed(1)}x</p>
                        <input type="range" min="0.6" max="1.6" step="0.1" value={rate} onChange={e => updateState({ voiceRate: parseFloat(e.target.value) })} className="w-full accent-[#5b32d4]" />
                    </div>
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
        </div>
    );
}
