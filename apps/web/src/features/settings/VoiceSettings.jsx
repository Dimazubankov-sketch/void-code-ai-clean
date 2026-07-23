import { useState } from 'react';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// VoiceSettings — раздел «Голос» в настройках
// ==========================================
// Выбор языка озвучки и голоса-пресета. Показывает голоса, доступные в
// браузере, сгруппированные по языку. Есть кнопка проверки — озвучивает
// пробную фразу выбранным голосом.

const LANGS = [
    { id: 'ru-RU', name: 'Русский' },
    { id: 'en-US', name: 'English (US)' },
    { id: 'en-GB', name: 'English (UK)' },
    { id: 'uk-UA', name: 'Українська' },
    { id: 'de-DE', name: 'Deutsch' },
    { id: 'fr-FR', name: 'Français' },
    { id: 'es-ES', name: 'Español' },
];

// Пресеты голоса для русского: разные тембры/скорости поверх системного
// голоса. Дают несколько вариантов озвучки, даже если в браузере всего один
// русский голос. Применяются как модификаторы pitch/rate.
const RU_PRESETS = [
    // Женские / нейтральные
    { id: 'default', name: 'Обычный', pitch: 1.0, rate: 1.0, group: 'Нейтральные' },
    { id: 'soft', name: 'Мягкий', pitch: 1.15, rate: 0.95, group: 'Нейтральные' },
    { id: 'bright', name: 'Звонкий', pitch: 1.3, rate: 1.05, group: 'Нейтральные' },
    { id: 'calm', name: 'Спокойный', pitch: 0.95, rate: 0.85, group: 'Нейтральные' },
    { id: 'fast', name: 'Быстрый', pitch: 1.05, rate: 1.35, group: 'Нейтральные' },
    // Мужские: ниже тон, разная подача
    { id: 'male_basic', name: 'Мужской', pitch: 0.75, rate: 1.0, group: 'Мужские' },
    { id: 'male_deep', name: 'Глубокий', pitch: 0.6, rate: 0.95, group: 'Мужские' },
    { id: 'male_calm', name: 'Спокойный муж.', pitch: 0.72, rate: 0.88, group: 'Мужские' },
    { id: 'male_brisk', name: 'Бодрый муж.', pitch: 0.8, rate: 1.2, group: 'Мужские' },
    { id: 'male_narrator', name: 'Диктор', pitch: 0.68, rate: 0.92, group: 'Мужские' },
];

const SAMPLE = {
    'ru-RU': 'Привет! Так звучит выбранный голос.',
    'uk-UA': 'Привіт! Так звучить обраний голос.',
    default: 'Hello! This is how the selected voice sounds.',
};

export function VoiceSettings({ state, updateState, onClose }) {
    const tts = useTextToSpeech();
    const lang = state.voiceLang || 'ru-RU';
    const rate = state.voiceRate || 1;
    const [testing, setTesting] = useState(false);

    // Голоса, подходящие под выбранный язык (по префиксу кода языка)
    const langPrefix = lang.split('-')[0];
    const matching = tts.voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
    const voiceList = matching.length ? matching : tts.voices;

    const setLang = (id) => updateState({ voiceLang: id, voiceURI: null });
    const setVoice = (uri) => updateState({ voiceURI: uri });
    const setRate = (r) => updateState({ voiceRate: r });
    const applyPreset = (p) => updateState({ voicePreset: p.id, voiceRate: p.rate, voicePitch: p.pitch });

    const test = () => {
        const sample = SAMPLE[lang] || SAMPLE.default;
        setTesting(true);
        tts.speak(sample, { lang, voiceURI: state.voiceURI || null, rate, pitch: state.voicePitch || 1 });
        setTimeout(() => setTesting(false), 3000);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 flex justify-end sm:justify-start fade-in" onClick={onClose}>
            <div className="w-full sm:w-1/3 sm:min-w-[360px] h-full bg-white dark:bg-darkCard shadow-2xl slide-in-right flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.ChevronLeft /></button>
                    <h4 className="font-extrabold text-lg dark:text-white flex items-center gap-2"><Icons.Volume2 className="w-5 h-5 text-[#5b32d4]" /> Голос</h4>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {!tts.supported && (
                        <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
                            Ваш браузер не поддерживает озвучку текста. Попробуйте Chrome, Edge или Яндекс.Браузер.
                        </div>
                    )}

                    {/* Язык */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Язык озвучки</p>
                        <div className="grid grid-cols-2 gap-2">
                            {LANGS.map(l => (
                                <button key={l.id} onClick={() => setLang(l.id)} className={`px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-colors ${lang === l.id ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{l.name}</button>
                            ))}
                        </div>
                    </div>

                    {/* Пресеты голоса для русского — с разделением на мужские */}
                    {lang === 'ru-RU' && ['Нейтральные', 'Мужские'].map(group => (
                        <div key={group}>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{group === 'Мужские' ? 'Мужские голоса' : 'Вариант озвучки'}</p>
                            <div className="grid grid-cols-3 gap-2">
                                {RU_PRESETS.filter(x => x.group === group).map(p => {
                                    const on = (state.voicePreset || 'default') === p.id;
                                    return (
                                        <button key={p.id} onClick={() => applyPreset(p)} className={`px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${on ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{p.name}</button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Голоса-пресеты */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Голос</p>
                        {voiceList.length === 0 ? (
                            <p className="text-sm text-gray-400">Голоса не найдены в этом браузере.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                {voiceList.map(v => (
                                    <button key={v.voiceURI} onClick={() => setVoice(v.voiceURI)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${state.voiceURI === v.voiceURI ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                                        <div className="w-9 h-9 rounded-full bg-[#5b32d4]/10 text-[#5b32d4] flex items-center justify-center shrink-0"><Icons.Volume2 className="w-4 h-4" /></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm dark:text-white truncate">{v.name}</p>
                                            <p className="text-[11px] text-gray-400">{v.lang}</p>
                                        </div>
                                        {state.voiceURI === v.voiceURI && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Скорость */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Скорость: {rate.toFixed(1)}x</p>
                        <input type="range" min="0.6" max="1.6" step="0.1" value={rate} onChange={e => setRate(parseFloat(e.target.value))} className="w-full accent-[#5b32d4]" />
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-darkBorder shrink-0">
                    <button onClick={test} disabled={!tts.supported} className="w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        <Icons.Volume2 className="w-4 h-4" /> {testing ? 'Проигрываю…' : 'Проверить голос'}
                    </button>
                </div>
            </div>
        </div>
    );
}
