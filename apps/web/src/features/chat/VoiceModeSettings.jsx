import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '@/shared/ui/Icons';
import { VOICE_PRESETS } from '@/features/settings/VoiceSettings';
import { useFishVoices } from '@/shared/lib/useOpenAiTts';

// ==========================================
// VoiceModeSettings — «Голосовые настройки» внутри Voice Mode
// ==========================================
// Открывается кнопкой-ползунками в правом верхнем углу голосового режима.
// Всё, что здесь настраивается, влияет на текущий разговор сразу:
//   • Голос — тот же список Fish Audio, что и в общих настройках (отдельной
//     системы голосов не заводим).
//   • Личность — системная «надстройка» над голосовым промптом; уходит на
//     бэкенд полем persona и дописывается к VOICE_SYSTEM_PROMPT.
//   • Язык озвучки, скорость, проверка микрофона.

// Стикеры для личностей — эмодзи, а не картинки: не тянут ассеты, одинаково
// выглядят в обеих темах и не требуют отдельной загрузки.
export const PERSONA_STICKERS = [
    '🙂', '🤖', '🧠', '📖', '🧸', '🎓', '🕵️', '🧑‍🍳', '🧑‍⚕️', '🧑‍🏫',
    '🎨', '🎧', '🏋️', '🌱', '🔮', '⚡', '🌙', '☕', '🚀', '🦉',
];

// Десять заготовленных личностей. instructions уходят в системный промпт
// голосового режима — поэтому они написаны как прямые указания модели.
export const BUILTIN_PERSONAS = [
    { id: 'assistant', sticker: '🙂', name: 'Ассистент', instructions: 'Ты обычный дружелюбный ассистент. Отвечай коротко и по делу, без лишних вступлений.' },
    { id: 'support', sticker: '🧸', name: 'Поддерживающий', instructions: 'Ты тёплый и спокойный собеседник. Слушай внимательно, поддерживай, но не сюсюкай и не давай пустых обещаний.' },
    { id: 'storyteller', sticker: '📖', name: 'Рассказчик', instructions: 'Ты мастер устного рассказа. Говори образно, держи интригу, но помни, что тебя слушают вслух — не растягивай без нужды.' },
    { id: 'kids', sticker: '🧒', name: 'Сказки детям', instructions: 'Ты рассказываешь добрые сказки для детей. Простые слова, короткие фразы, никакого страшного или взрослого содержания.' },
    { id: 'coach', sticker: '🏋️', name: 'Коуч', instructions: 'Ты требовательный коуч. Задавай неудобные вопросы, не давай отговорок, подталкивай к конкретному следующему шагу.' },
    { id: 'teacher', sticker: '🧑‍🏫', name: 'Преподаватель', instructions: 'Ты объясняешь сложное простым языком. Проверяй понимание короткими вопросами, приводи бытовые аналогии.' },
    { id: 'engineer', sticker: '🤖', name: 'Инженер', instructions: 'Ты опытный инженер. Говори технически точно, называй компромиссы, не притворяйся, что знаешь то, чего не знаешь.' },
    { id: 'skeptic', sticker: '🕵️', name: 'Скептик', instructions: 'Ты дотошный скептик. Ищи слабые места в рассуждениях собеседника и прямо на них указывай, но без грубости.' },
    { id: 'calm', sticker: '🌙', name: 'Спокойный', instructions: 'Ты говоришь медленно и размеренно. Короткие предложения, спокойный тон, никакой спешки и напора.' },
    { id: 'brief', sticker: '⚡', name: 'Максимально кратко', instructions: 'Отвечай предельно коротко — одна-две фразы, только суть, без примеров и пояснений, если о них не просили.' },
];

// Языки, поддерживаемые Fish Audio для синтеза речи.
export const VOICE_MODE_LANGS = [
    { id: 'ru-RU', name: 'Русский' },
    { id: 'en-US', name: 'English' },
    { id: 'zh-CN', name: '中文' },
    { id: 'ja-JP', name: '日本語' },
    { id: 'ko-KR', name: '한국어' },
    { id: 'de-DE', name: 'Deutsch' },
    { id: 'fr-FR', name: 'Français' },
    { id: 'es-ES', name: 'Español' },
    { id: 'pt-PT', name: 'Português' },
    { id: 'it-IT', name: 'Italiano' },
    { id: 'pl-PL', name: 'Polski' },
    { id: 'nl-NL', name: 'Nederlands' },
    { id: 'ar-SA', name: 'العربية' },
];

function Row({ label, value, onClick }) {
    return (
        <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors">
            <span className="font-semibold text-[15px] text-gray-900 dark:text-white">{label}</span>
            <span className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-white/50 min-w-0">
                <span className="truncate max-w-[9rem]">{value}</span>
                <Icons.ChevronRight className="w-4 h-4 shrink-0" />
            </span>
        </button>
    );
}

function PickerSheet({ title, items, selectedId, onChoose, onClose }) {
    return (
        <div className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-sm flex items-end sm:items-center sm:justify-center fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-[#150d28] w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                    <h4 className="font-extrabold text-gray-900 dark:text-white">{title}</h4>
                    <button onClick={onClose} className="void-tap-target w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Icons.X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {items.map((it) => (
                        <button key={it.id || 'default'} onClick={() => onChoose(it.id)} className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-colors ${selectedId === it.id ? 'bg-gray-100 dark:bg-white/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <span className="min-w-0">
                                <span className="block font-semibold text-sm text-gray-900 dark:text-white truncate">{it.name}</span>
                                {it.desc && <span className="block text-xs text-gray-400 dark:text-white/50 truncate">{it.desc}</span>}
                            </span>
                            {selectedId === it.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-[#8b6ef0] shrink-0" />}
                        </button>
                    ))}
                    {items.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Загружается…</p>}
                </div>
            </div>
        </div>
    );
}

// ---- Экран создания/редактирования личности ----
function PersonaEditor({ initial, onSave, onClose }) {
    const [sticker, setSticker] = useState(initial?.sticker || PERSONA_STICKERS[0]);
    const [name, setName] = useState(initial?.name || '');
    const [instructions, setInstructions] = useState(initial?.instructions || '');
    const canSave = name.trim().length > 0 && instructions.trim().length > 0;

    return (
        <div className="fixed inset-0 z-[260] bg-white dark:bg-[#0d0819] flex flex-col fade-in">
            <div className="flex items-center gap-3 px-4 py-4 shrink-0">
                <button onClick={onClose} className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white">
                    <Icons.ChevronLeft className="w-5 h-5" />
                </button>
                <h4 className="flex-1 text-center font-extrabold text-gray-900 dark:text-white">{initial ? 'Личность' : 'Новая личность'}</h4>
                <button
                    onClick={() => canSave && onSave({ sticker, name: name.trim(), instructions: instructions.trim() })}
                    disabled={!canSave}
                    className={`void-tap-target w-10 h-10 rounded-full flex items-center justify-center transition-colors ${canSave ? 'bg-[#5b32d4] text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-400'}`}
                >
                    <Icons.Check className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-8">
                <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">Стикер</p>
                <div className="grid grid-cols-8 gap-2 mb-6">
                    {PERSONA_STICKERS.map((st) => (
                        <button
                            key={st}
                            onClick={() => setSticker(st)}
                            className={`aspect-square rounded-2xl text-xl flex items-center justify-center transition-colors ${sticker === st ? 'bg-[#5b32d4]/15 ring-2 ring-[#5b32d4]' : 'bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/10'}`}
                        >
                            {st}
                        </button>
                    ))}
                </div>

                <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">Имя</p>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 40))}
                    placeholder="Рассказчик"
                    className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4] mb-6"
                />

                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Инструкции</p>
                    <span className="text-xs text-gray-400">{instructions.length}/1500</span>
                </div>
                <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value.slice(0, 1500))}
                    rows={8}
                    placeholder="Ты мастер устного рассказа: говори образно, держи интригу, но не растягивай."
                    className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4] resize-none"
                />
            </div>
        </div>
    );
}

// ---- Проверка микрофона ----
function MicCheck({ onClose }) {
    const [level, setLevel] = useState(0);
    const [error, setError] = useState(null);
    const barRef = useRef(null);

    useEffect(() => {
        let stream = null; let ctx = null; let raf = null; let cancelled = false;
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
                if (cancelled) return;
                const AC = window.AudioContext || window.webkitAudioContext;
                ctx = new AC();
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                ctx.createMediaStreamSource(stream).connect(analyser);
                const data = new Uint8Array(analyser.frequencyBinCount);
                const tick = () => {
                    analyser.getByteFrequencyData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) sum += data[i];
                    setLevel(Math.min(1, (sum / data.length / 255) * 2.2));
                    raf = requestAnimationFrame(tick);
                };
                tick();
            } catch {
                if (!cancelled) setError('Нет доступа к микрофону. Разреши доступ в настройках браузера.');
            }
        })();
        return () => {
            cancelled = true;
            if (raf) cancelAnimationFrame(raf);
            try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
            try { ctx?.close(); } catch { /* noop */ }
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-[#150d28] w-full max-w-xs rounded-3xl shadow-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
                <h4 className="font-extrabold text-gray-900 dark:text-white mb-1">Микрофон</h4>
                <p className="text-sm text-gray-400 mb-5">{error ? '' : 'Скажи что-нибудь — полоса должна двигаться'}</p>
                {error ? (
                    <p className="text-sm text-red-500 mb-5">{error}</p>
                ) : (
                    <div className="h-3 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden mb-5">
                        <div ref={barRef} className="h-full bg-[#5b32d4] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
                    </div>
                )}
                <button onClick={onClose} className="void-tap-target w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">Готово</button>
            </div>
        </div>
    );
}

export function VoiceModeSettings({ state, updateState, onClose }) {
    const [picker, setPicker] = useState(null); // 'voice' | 'lang' | null
    const [editorOpen, setEditorOpen] = useState(false);
    const [micOpen, setMicOpen] = useState(false);

    const provider = state.ttsProvider || 'fish';
    const { voices: fishVoices } = useFishVoices();
    const voiceList = provider === 'openai'
        ? VOICE_PRESETS.map((v) => ({ id: v.id, name: v.name, desc: v.desc }))
        : fishVoices.map((v) => ({ id: v.id, name: v.title, desc: v.description }));
    const selectedVoiceId = provider === 'openai' ? (state.voicePreset || 'nova') : (state.voicePresetFish || voiceList[0]?.id || '');
    const voiceLabel = (voiceList.find((v) => v.id === selectedVoiceId) || voiceList[0])?.name || 'Голос';

    const customPersonas = state.voicePersonas || [];
    const allPersonas = [...BUILTIN_PERSONAS, ...customPersonas];
    const activePersonaId = state.activePersonaId || BUILTIN_PERSONAS[0].id;

    const lang = state.voiceLang || 'ru-RU';
    const langLabel = (VOICE_MODE_LANGS.find((l) => l.id === lang) || VOICE_MODE_LANGS[0]).name;
    const rate = state.voiceRate || 1;

    const savePersona = ({ sticker, name, instructions }) => {
        const persona = { id: `custom_${Date.now()}`, sticker, name, instructions };
        updateState({ voicePersonas: [...customPersonas, persona], activePersonaId: persona.id });
        setEditorOpen(false);
    };

    return createPortal(
        <div className="fixed inset-0 z-[240] bg-white dark:bg-[#0d0819] flex flex-col fade-in">
            <div className="flex items-center gap-3 px-4 py-4 shrink-0">
                <button onClick={onClose} className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white">
                    <Icons.ChevronLeft className="w-5 h-5" />
                </button>
                <h4 className="flex-1 text-center font-extrabold text-gray-900 dark:text-white">Голосовые настройки</h4>
                <div className="w-10 shrink-0" />
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-6">
                <Row label="Голос" value={voiceLabel} onClick={() => setPicker('voice')} />

                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 px-1">Личность</p>
                    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                        <button onClick={() => setEditorOpen(true)} className="shrink-0 flex flex-col items-center gap-1.5 w-20">
                            <span className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center transition-colors">
                                <Icons.Plus className="w-6 h-6 text-gray-700 dark:text-white" />
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-white/60 text-center leading-tight">Создать</span>
                        </button>
                        {allPersonas.map((p) => (
                            <button key={p.id} onClick={() => updateState({ activePersonaId: p.id })} className="shrink-0 flex flex-col items-center gap-1.5 w-20">
                                <span className={`relative w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-colors ${activePersonaId === p.id ? 'bg-[#5b32d4]/15 ring-2 ring-[#5b32d4]' : 'bg-gray-100 dark:bg-white/[0.06]'}`}>
                                    {p.sticker}
                                    {activePersonaId === p.id && (
                                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#5b32d4] text-white flex items-center justify-center">
                                            <Icons.Check className="w-3 h-3" />
                                        </span>
                                    )}
                                </span>
                                <span className="text-[11px] text-gray-500 dark:text-white/60 text-center leading-tight line-clamp-2">{p.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <Row label="Язык озвучки" value={langLabel} onClick={() => setPicker('lang')} />

                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 px-1">Скорость</p>
                    <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.06]">
                        <span className="text-sm font-bold text-gray-900 dark:text-white w-12 shrink-0">{rate.toFixed(1)}×</span>
                        <input
                            type="range" min="0.5" max="2" step="0.1" value={rate}
                            onChange={(e) => updateState({ voiceRate: parseFloat(e.target.value) })}
                            className="flex-1 accent-[#5b32d4]"
                        />
                    </div>
                </div>

                <Row label="Микрофон" value="Проверить" onClick={() => setMicOpen(true)} />
            </div>

            {picker === 'voice' && (
                <PickerSheet
                    title="Голос" items={voiceList} selectedId={selectedVoiceId}
                    onChoose={(id) => { updateState(provider === 'openai' ? { voicePreset: id } : { voicePresetFish: id }); setPicker(null); }}
                    onClose={() => setPicker(null)}
                />
            )}
            {picker === 'lang' && (
                <PickerSheet
                    title="Язык озвучки" items={VOICE_MODE_LANGS} selectedId={lang}
                    onChoose={(id) => { updateState({ voiceLang: id }); setPicker(null); }}
                    onClose={() => setPicker(null)}
                />
            )}
            {editorOpen && <PersonaEditor onSave={savePersona} onClose={() => setEditorOpen(false)} />}
            {micOpen && <MicCheck onClose={() => setMicOpen(false)} />}
        </div>,
        document.body,
    );
}
