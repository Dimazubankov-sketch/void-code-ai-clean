import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { VOICE_PRESETS } from '@/features/settings/VoiceSettings';
import { useFishVoices } from '@/shared/lib/useOpenAiTts';
import { PERSONA_STICKERS, StickerIcon } from '@/features/chat/PersonaStickers';
import { EmotionSettings } from '@/features/settings/EmotionSettings';
import { EMOTION_MODES, EMOTION_PRESETS, getEmotionSettings } from '@/shared/config/voiceEmotions';

// ==========================================
// VoiceModeSettings — «Голосовые настройки» внутри Voice Mode
// ==========================================
// Раскладка: на телефоне контент во всю ширину, на десктопе — прижат к
// ЛЕВОМУ краю и занимает половину экрана (md:max-w-[50vw]). Без этого
// на широком мониторе строки растягивались на весь экран и выглядели
// пустыми полосами.
//
// Стикеры личностей — векторные (PersonaStickers.jsx), не эмодзи:
// одинаковый вид на всех платформах.

// Стандартные горизонтальные отступы + ограничение ширины на десктопе.
// Держим в одной константе, чтобы все секции экрана были выровнены.
const COL = 'w-full px-4 md:px-6';

// На десктопе настройки — не полноэкранный слой, а КВАДРАТНОЕ окно по
// центру поверх затемнения (на телефоне остаётся полный экран: окно на
// маленьком экране только сжимало бы и без того тесный список).
const PANEL_DESKTOP = 'md:w-[560px] md:h-[560px] md:rounded-3xl md:shadow-2xl md:overflow-hidden';

export const BUILTIN_PERSONAS = [
    { id: 'assistant', sticker: 'smile', name: 'Ассистент', instructions: 'Ты обычный дружелюбный ассистент. Отвечай коротко и по делу, без лишних вступлений.' },
    { id: 'support', sticker: 'bear', name: 'Поддерживающий', instructions: 'Ты тёплый и спокойный собеседник. Слушай внимательно, поддерживай, но не сюсюкай и не давай пустых обещаний.' },
    { id: 'storyteller', sticker: 'book', name: 'Рассказчик', instructions: 'Ты мастер устного рассказа. Говори образно, держи интригу, но помни, что тебя слушают вслух — не растягивай без нужды.' },
    { id: 'kids', sticker: 'owl', name: 'Сказки детям', instructions: 'Ты рассказываешь добрые сказки для детей. Простые слова, короткие фразы, никакого страшного или взрослого содержания.' },
    { id: 'coach', sticker: 'muscle', name: 'Коуч', instructions: 'Ты требовательный коуч. Задавай неудобные вопросы, не давай отговорок, подталкивай к конкретному следующему шагу.' },
    { id: 'teacher', sticker: 'teacher', name: 'Преподаватель', instructions: 'Ты объясняешь сложное простым языком. Проверяй понимание короткими вопросами, приводи бытовые аналогии.' },
    { id: 'engineer', sticker: 'robot', name: 'Инженер', instructions: 'Ты опытный инженер. Говори технически точно, называй компромиссы, не притворяйся, что знаешь то, чего не знаешь.' },
    { id: 'skeptic', sticker: 'detective', name: 'Скептик', instructions: 'Ты дотошный скептик. Ищи слабые места в рассуждениях собеседника и прямо на них указывай, но без грубости.' },
    { id: 'calm', sticker: 'moon', name: 'Спокойный', instructions: 'Ты говоришь медленно и размеренно. Короткие предложения, спокойный тон, никакой спешки и напора.' },
    { id: 'brief', sticker: 'bolt', name: 'Максимально кратко', instructions: 'Отвечай предельно коротко — одна-две фразы, только суть, без примеров и пояснений, если о них не просили.' },
];

export const VOICE_MODE_LANGS = [
    { id: 'ru-RU', name: 'Русский' }, { id: 'en-US', name: 'English' }, { id: 'zh-CN', name: '中文' },
    { id: 'ja-JP', name: '日本語' }, { id: 'ko-KR', name: '한국어' }, { id: 'de-DE', name: 'Deutsch' },
    { id: 'fr-FR', name: 'Français' }, { id: 'es-ES', name: 'Español' }, { id: 'pt-PT', name: 'Português' },
    { id: 'it-IT', name: 'Italiano' }, { id: 'pl-PL', name: 'Polski' }, { id: 'nl-NL', name: 'Nederlands' },
    { id: 'ar-SA', name: 'العربية' },
];

// ---- Общий эффект нажатия (GSAP) ----
// Обработчики создаются один раз внутри useGSAP и оборачиваются в
// contextSafe — как требует gsap-react skill для анимаций, которые
// запускаются из событий уже ПОСЛЕ рендера.
function usePressAnimation(ref) {
    const pressRef = useRef(() => {});
    const releaseRef = useRef(() => {});
    useGSAP((context, contextSafe) => {
        pressRef.current = contextSafe(() => {
            if (ref.current) gsap.to(ref.current, { scale: 0.96, duration: 0.09, ease: 'power2.out', overwrite: 'auto' });
        });
        releaseRef.current = contextSafe(() => {
            if (ref.current) gsap.to(ref.current, { scale: 1, duration: 0.28, ease: 'back.out(2.2)', overwrite: 'auto' });
        });
    }, { scope: ref });
    return {
        onPointerDown: () => pressRef.current(),
        onPointerUp: () => releaseRef.current(),
        onPointerLeave: () => releaseRef.current(),
    };
}

function PressButton({ onClick, className, children, title }) {
    const ref = useRef(null);
    const press = usePressAnimation(ref);
    return <button ref={ref} onClick={onClick} title={title} className={className} {...press}>{children}</button>;
}

function Row({ label, value, onClick }) {
    return (
        <PressButton
            onClick={onClick}
            className="vm-row w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
        >
            <span className="font-semibold text-[15px] text-gray-900 dark:text-white">{label}</span>
            <span className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-white/50 min-w-0">
                <span className="truncate max-w-[9rem]">{value}</span>
                <Icons.ChevronRight className="w-4 h-4 shrink-0" />
            </span>
        </PressButton>
    );
}

function PickerSheet({ title, items, selectedId, onChoose, onClose }) {
    return (
        <div className="fixed inset-0 z-[250] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-[#150d28] w-full sm:max-w-sm rounded-3xl shadow-2xl max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                    <h4 className="font-extrabold text-gray-900 dark:text-white">{title}</h4>
                    <button onClick={onClose} className="void-tap-target w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Icons.X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto void-no-scrollbar px-3 pb-4">
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

// Круглая «плитка» личности/стикера. py-2 у контейнера-скроллера + отсутствие
// overflow по вертикали важны: раньше кольцо выделения и галочка обрезались
// границей горизонтального скролла.
function StickerTile({ stickerId, label, selected, onClick }) {
    const ref = useRef(null);
    const press = usePressAnimation(ref);
    return (
        <button ref={ref} onClick={onClick} {...press} className="shrink-0 flex flex-col items-center gap-1.5 w-20">
            <span className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-colors ${selected ? 'bg-[#5b32d4]/15 ring-2 ring-[#5b32d4] text-[#5b32d4]' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/80'}`}>
                <StickerIcon id={stickerId} className="w-7 h-7" />
                {selected && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#5b32d4] text-white flex items-center justify-center">
                        <Icons.Check className="w-3 h-3" />
                    </span>
                )}
            </span>
            {label && <span className="text-[11px] text-gray-500 dark:text-white/60 text-center leading-tight line-clamp-2">{label}</span>}
        </button>
    );
}

// Плитка «Создать» — плюс, а не стикер: это действие, а не личность.
function CreateTile({ onClick }) {
    const ref = useRef(null);
    const press = usePressAnimation(ref);
    return (
        <button ref={ref} onClick={onClick} {...press} className="shrink-0 flex flex-col items-center gap-1.5 w-20">
            <span className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-white flex items-center justify-center transition-colors">
                <Icons.Plus className="w-7 h-7" />
            </span>
            <span className="text-[11px] text-gray-500 dark:text-white/60 text-center leading-tight">Создать</span>
        </button>
    );
}

// ---- Экран создания личности ----
function PersonaEditor({ onSave, onClose }) {
    const [sticker, setSticker] = useState(PERSONA_STICKERS[0].id);
    const [name, setName] = useState('');
    const [instructions, setInstructions] = useState('');
    // На десктопе список стикеров скрыт за кнопкой и выкатывается вниз
    // со скроллом; на телефоне он всегда виден как горизонтальная лента
    // со свайпом — там выкатывающийся блок только мешал бы.
    const [deskOpen, setDeskOpen] = useState(false);
    const deskListRef = useRef(null);
    const canSave = name.trim().length > 0 && instructions.trim().length > 0;

    // Плавное выкатывание списка стикеров на десктопе.
    useGSAP(() => {
        const el = deskListRef.current;
        if (!el) return;
        if (deskOpen) {
            gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.32, ease: 'power2.out' });
        } else {
            gsap.to(el, { height: 0, autoAlpha: 0, duration: 0.22, ease: 'power2.in' });
        }
    }, { dependencies: [deskOpen] });

    return (
        <div className="fixed inset-0 z-[260] md:bg-black/40 md:backdrop-blur-sm flex md:items-center md:justify-center fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`w-full h-full bg-white dark:bg-[#0d0819] flex flex-col ${PANEL_DESKTOP}`} onClick={(e) => e.stopPropagation()}>
            <div className={`${COL} flex items-center gap-3 py-4 shrink-0`}>
                <button onClick={onClose} className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white">
                    <Icons.ChevronLeft className="w-5 h-5" />
                </button>
                <h4 className="flex-1 text-center font-extrabold text-gray-900 dark:text-white">Новая личность</h4>
                <PressButton
                    onClick={() => canSave && onSave({ sticker, name: name.trim(), instructions: instructions.trim() })}
                    className={`void-tap-target w-10 h-10 rounded-full flex items-center justify-center transition-colors ${canSave ? 'bg-[#5b32d4] text-white' : 'bg-gray-200 dark:bg-white/10 text-gray-400'}`}
                >
                    <Icons.Check className="w-5 h-5" />
                </PressButton>
            </div>

            <div className="flex-1 overflow-y-auto void-no-scrollbar">
                <div className={`${COL} pb-10`}>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Стикер</p>

                    {/* Телефон: горизонтальная лента со свайпом */}
                    <div className="md:hidden flex gap-3 overflow-x-auto void-no-scrollbar py-2 -mx-4 px-4 mb-6">
                        {PERSONA_STICKERS.map((st) => (
                            <StickerTile key={st.id} stickerId={st.id} selected={sticker === st.id} onClick={() => setSticker(st.id)} />
                        ))}
                    </div>

                    {/* Десктоп: кнопка + выкатывающийся список со скроллом */}
                    <div className="hidden md:block mb-6">
                        <PressButton
                            onClick={() => setDeskOpen((v) => !v)}
                            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
                        >
                            <span className="flex items-center gap-3">
                                <span className="w-9 h-9 rounded-full bg-white dark:bg-white/10 flex items-center justify-center text-[#5b32d4]">
                                    <StickerIcon id={sticker} className="w-5 h-5" />
                                </span>
                                <span className="font-semibold text-[15px] text-gray-900 dark:text-white">Выбрать стикер</span>
                            </span>
                            <Icons.ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${deskOpen ? 'rotate-90' : ''}`} />
                        </PressButton>
                        <div ref={deskListRef} className="overflow-hidden" style={{ height: 0, opacity: 0 }}>
                            <div className="max-h-56 overflow-y-auto void-no-scrollbar mt-3 p-3 rounded-2xl bg-gray-50 dark:bg-white/[0.04]">
                                <div className="grid grid-cols-6 gap-3">
                                    {PERSONA_STICKERS.map((st) => (
                                        <StickerTile key={st.id} stickerId={st.id} selected={sticker === st.id} onClick={() => setSticker(st.id)} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Имя</p>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 40))}
                        placeholder="Рассказчик"
                        className="w-full px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4] mb-6"
                    />

                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Инструкции</p>
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
        </div>
        </div>
    );
}

// ---- Проверка микрофона ----
function MicCheck({ onClose }) {
    const [level, setLevel] = useState(0);
    const [error, setError] = useState(null);

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
                        <div className="h-full bg-[#5b32d4] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
                    </div>
                )}
                <button onClick={onClose} className="void-tap-target w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors">Готово</button>
            </div>
        </div>
    );
}

export function VoiceModeSettings({ state, updateState, onClose }) {
    const [picker, setPicker] = useState(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [micOpen, setMicOpen] = useState(false);
    const [emotionsOpen, setEmotionsOpen] = useState(false);
    const scope = useRef(null);

    // Появление блоков сверху вниз по очереди при входе в настройки.
    useGSAP(() => {
        gsap.from('.vm-anim', {
            y: 18, autoAlpha: 0, duration: 0.32, ease: 'power2.out', stagger: 0.06, clearProps: 'all',
        });
    }, { scope });

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

    const emo = getEmotionSettings(state);
    const emotionLabel = emo.mode === EMOTION_MODES.AUTO
        ? 'Автоматически'
        : (EMOTION_PRESETS.find((p) => p.id === emo.preset)?.name || 'Вручную');

    const savePersona = ({ sticker, name, instructions }) => {
        const persona = { id: `custom_${Date.now()}`, sticker, name, instructions };
        updateState({ voicePersonas: [...customPersonas, persona], activePersonaId: persona.id });
        setEditorOpen(false);
    };

    return createPortal(
        <div className="fixed inset-0 z-[240] md:bg-black/40 md:backdrop-blur-sm flex md:items-center md:justify-center fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={scope} className={`w-full h-full bg-white dark:bg-[#0d0819] flex flex-col ${PANEL_DESKTOP}`} onClick={(e) => e.stopPropagation()}>
            <div className={`${COL} flex items-center gap-3 py-4 shrink-0`}>
                <button onClick={onClose} className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white">
                    <Icons.ChevronLeft className="w-5 h-5" />
                </button>
                <h4 className="flex-1 text-center font-extrabold text-gray-900 dark:text-white">Голосовые настройки</h4>
                <div className="w-10 shrink-0" />
            </div>

            <div className="flex-1 overflow-y-auto void-no-scrollbar">
                <div className={`${COL} pb-10 space-y-6`}>
                    <div className="vm-anim"><Row label="Голос" value={voiceLabel} onClick={() => setPicker('voice')} /></div>

                    <div className="vm-anim">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Личность</p>
                        {/* py-2 и отсутствие вертикального overflow — чтобы кольцо
                            выделения и галочка не срезались краем ленты. */}
                        <div className="flex gap-3 overflow-x-auto overflow-y-visible void-persona-scroll py-2 -mx-4 px-4 md:-mx-6 md:px-6 md:pb-3">
                            <CreateTile onClick={() => setEditorOpen(true)} />
                            {allPersonas.map((p) => (
                                <StickerTile
                                    key={p.id}
                                    stickerId={p.sticker}
                                    label={p.name}
                                    selected={activePersonaId === p.id}
                                    onClick={() => updateState({ activePersonaId: p.id })}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Эмоции — сразу после блока «Личность», как и в общих
                        настройках голоса. Компонент общий, второй копии нет. */}
                    <div className="vm-anim"><Row label="Эмоции" value={emotionLabel} onClick={() => setEmotionsOpen(true)} /></div>

                    <div className="vm-anim"><Row label="Язык озвучки" value={langLabel} onClick={() => setPicker('lang')} /></div>

                    <div className="vm-anim">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Скорость</p>
                        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.06]">
                            <span className="text-sm font-bold text-gray-900 dark:text-white w-12 shrink-0">{rate.toFixed(1)}×</span>
                            <input
                                type="range" min="0.5" max="2" step="0.1" value={rate}
                                onChange={(e) => updateState({ voiceRate: parseFloat(e.target.value) })}
                                className="flex-1 accent-[#5b32d4]"
                            />
                        </div>
                    </div>

                    <div className="vm-anim"><Row label="Микрофон" value="Проверить" onClick={() => setMicOpen(true)} /></div>
                </div>
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
            {emotionsOpen && <EmotionSettings state={state} updateState={updateState} onClose={() => setEmotionsOpen(false)} />}
        </div>
        </div>,
        document.body,
    );
}
