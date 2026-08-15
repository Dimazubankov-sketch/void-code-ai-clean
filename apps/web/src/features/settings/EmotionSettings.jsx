import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import {
    EMOTION_MODES, EMOTION_PRESETS, getEmotionSettings,
} from '@/shared/config/voiceEmotions';

// ==========================================
// EmotionSettings — «Эмоции» (тон и подача голоса)
// ==========================================
// Открывается из Настройки → Голос и из голосовых настроек Voice Mode —
// один и тот же компонент, второй реализации нет.
//
// Настройки сохраняются в state.voiceEmotion (persist в storage.jsx) и
// применяются во всех будущих сессиях: и к озвучке сообщений в чате, и к
// Voice Mode — оба пути берут их из getVoiceOpts.
//
// Фича доступна на всех тарифах. Если понадобится закрыть подпиской,
// достаточно одной проверки в getVoiceOpts — интерфейс трогать не нужно.

function Slider({ label, value, onChange }) {
    return (
        <div className="px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
                <span className="text-xs font-bold text-gray-400 tabular-nums">{value}%</span>
            </div>
            <input
                type="range" min="0" max="100" step="5" value={value}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="w-full accent-[#5b32d4]"
            />
        </div>
    );
}

export function EmotionSettings({ state, updateState, onClose }) {
    const scope = useRef(null);
    const manualRef = useRef(null);
    const s = getEmotionSettings(state);
    const isManual = s.mode === EMOTION_MODES.MANUAL;

    const patch = (changes) => updateState({ voiceEmotion: { ...s, ...changes } });

    // Появление блоков сверху вниз — тот же приём, что и в голосовых
    // настройках, чтобы экраны ощущались одинаково.
    useGSAP(() => {
        gsap.from('.em-anim', { y: 16, autoAlpha: 0, duration: 0.3, ease: 'power2.out', stagger: 0.05, clearProps: 'all' });
    }, { scope });

    // Ручной блок плавно раскрывается/скрывается при переключении режима.
    useGSAP(() => {
        const el = manualRef.current;
        if (!el) return;
        if (isManual) {
            gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.34, ease: 'power2.out' });
        } else {
            gsap.to(el, { height: 0, autoAlpha: 0, duration: 0.22, ease: 'power2.in' });
        }
    }, { dependencies: [isManual] });

    return (
        <div className="fixed inset-0 z-[255] md:bg-black/40 md:backdrop-blur-sm flex md:items-center md:justify-center fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div ref={scope} className="w-full h-full bg-white dark:bg-[#0d0819] flex flex-col md:w-[560px] md:h-[560px] md:rounded-3xl md:shadow-2xl md:overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-4 md:px-6 py-4 shrink-0">
                    <button onClick={onClose} className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white">
                        <Icons.ChevronLeft className="w-5 h-5" />
                    </button>
                    <h4 className="flex-1 text-center font-extrabold text-gray-900 dark:text-white">Эмоции</h4>
                    <div className="w-10 shrink-0" />
                </div>

                <div className="flex-1 overflow-y-auto void-no-scrollbar px-4 md:px-6 pb-10 space-y-5">
                    {/* Режим */}
                    <div className="em-anim grid grid-cols-2 gap-2">
                        {[
                            { id: EMOTION_MODES.AUTO, name: 'Автоматически', hint: 'ИИ подбирает подачу сам' },
                            { id: EMOTION_MODES.MANUAL, name: 'Вручную', hint: 'Свой стиль голоса' },
                        ].map((m) => (
                            <button
                                key={m.id}
                                onClick={() => patch({ mode: m.id })}
                                className={`px-4 py-3 rounded-2xl text-left transition-colors ${s.mode === m.id ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10'}`}
                            >
                                <span className="block text-sm font-bold">{m.name}</span>
                                <span className={`block text-[11px] leading-tight mt-0.5 ${s.mode === m.id ? 'text-white/70' : 'text-gray-400'}`}>{m.hint}</span>
                            </button>
                        ))}
                    </div>

                    {s.mode === EMOTION_MODES.AUTO && (
                        <p className="em-anim text-xs text-gray-400 leading-relaxed px-1">
                            В автоматическом режиме подача выбирается по смыслу самого ответа: серьёзный вопрос прозвучит сдержанно, а хорошая новость — живее.
                        </p>
                    )}

                    {/* Ручной блок */}
                    <div ref={manualRef} className="overflow-hidden" style={{ height: 0, opacity: 0 }}>
                        <div className="space-y-5 pt-1">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Стиль</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {EMOTION_PRESETS.map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => patch({ preset: p.id })}
                                            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${s.preset === p.id ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                        >
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                <Slider label="Эмоциональность" value={s.expressiveness} onChange={(v) => patch({ expressiveness: v })} />
                                <Slider label="Энергичность" value={s.energy} onChange={(v) => patch({ energy: v })} />
                                <Slider label="Теплота" value={s.warmth} onChange={(v) => patch({ warmth: v })} />
                                {/* Скорость намеренно тут же, но пишется в voiceRate —
                                    то же поле, что и в голосовых настройках, чтобы не
                                    заводить второй источник правды. */}
                                <Slider label="Скорость" value={Math.round(((state.voiceRate || 1) - 0.5) / 1.5 * 100)} onChange={(v) => updateState({ voiceRate: +(0.5 + (v / 100) * 1.5).toFixed(1) })} />
                            </div>
                        </div>
                    </div>

                    <p className="em-anim text-xs text-gray-400 leading-relaxed px-1">
                        В голосовом режиме подачу можно менять на лету — просто скажите «говори спокойнее» или «будь энергичнее». Такая смена действует только до конца разговора и не меняет настройки здесь.
                    </p>
                </div>
            </div>
        </div>
    );
}
