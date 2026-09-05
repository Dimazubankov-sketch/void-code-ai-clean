import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { Toggle } from '@/shared/ui/Toggle';
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

function Slider({ label, value, onChange, disabled }) {
    // Короткий отклик на изменение: цифра «подпрыгивает». Без этого при
    // перетаскивании непонятно, зафиксировалось ли значение — особенно на
    // телефоне, где палец закрывает сам ползунок.
    const valueRef = useRef(null);
    const bump = () => {
        if (valueRef.current) {
            gsap.fromTo(valueRef.current, { scale: 1.25 }, { scale: 1, duration: 0.28, ease: 'back.out(3)', overwrite: 'auto' });
        }
    };
    return (
        <div className={`px-4 py-3 rounded-2xl bg-gray-100 dark:bg-white/[0.06] transition-opacity ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
                <span ref={valueRef} className="text-xs font-bold text-[#5b32d4] tabular-nums inline-block">{value}%</span>
            </div>
            <input
                type="range" min="0" max="100" step="5" value={value}
                disabled={disabled}
                onChange={(e) => { onChange(parseInt(e.target.value, 10)); bump(); }}
                className="w-full accent-[#5b32d4]"
            />
        </div>
    );
}

export function EmotionSettings({ state, updateState, onClose }) {
    const scope = useRef(null);
    const infoRef = useRef(null);
    const [infoOpen, setInfoOpen] = useState(false);
    const s = getEmotionSettings(state);
    const isAuto = s.mode === EMOTION_MODES.AUTO;

    const patch = (changes) => updateState({ voiceEmotion: { ...s, ...changes } });

    // Появление блоков сверху вниз — тот же приём, что и в голосовых
    // настройках, чтобы экраны ощущались одинаково.
    useGSAP(() => {
        gsap.from('.em-anim', { y: 16, autoAlpha: 0, duration: 0.3, ease: 'power2.out', stagger: 0.05, clearProps: 'all' });
    }, { scope });

    // Подробное пояснение раскрывается плавно по стрелке.
    useGSAP(() => {
        const el = infoRef.current;
        if (!el) return;
        if (infoOpen) {
            gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: 'auto', autoAlpha: 1, duration: 0.32, ease: 'power2.out' });
        } else {
            gsap.to(el, { height: 0, autoAlpha: 0, duration: 0.2, ease: 'power2.in' });
        }
    }, { dependencies: [infoOpen] });

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

                <div className="flex-1 overflow-y-auto void-no-scrollbar px-4 md:px-6 pb-10 space-y-4">
                    {/* Один экран вместо двух вкладок: сверху тумблер
                        «Автоматически», ниже — ручные настройки, которые
                        гаснут и перестают нажиматься, пока авто включён.
                        Так видно и текущий режим, и что именно он отключает. */}
                    <div className="em-anim rounded-2xl bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3.5">
                            <button
                                onClick={() => setInfoOpen((v) => !v)}
                                className="void-tap-target w-6 h-6 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                                title="Подробнее"
                            >
                                <Icons.ChevronRight className={`w-4 h-4 transition-transform ${infoOpen ? 'rotate-90' : ''}`} />
                            </button>
                            <span className="flex-1 font-bold text-[15px] text-gray-900 dark:text-white">Автоматически</span>
                            <Toggle
                                checked={isAuto}
                                onChange={() => patch({ mode: isAuto ? EMOTION_MODES.MANUAL : EMOTION_MODES.AUTO })}
                                className="shrink-0"
                            />
                        </div>
                        <div ref={infoRef} className="overflow-hidden" style={{ height: 0, opacity: 0 }}>
                            <p className="px-4 pb-4 text-xs text-gray-500 dark:text-white/60 leading-relaxed">
                                Подача выбирается по смыслу самого ответа: серьёзный вопрос прозвучит сдержанно, а хорошая новость — живее. Выключите автоматический режим, чтобы задать стиль голоса вручную.
                            </p>
                        </div>
                    </div>

                    <div className={`em-anim transition-opacity ${isAuto ? 'opacity-40' : ''}`}>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Стиль</p>
                        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${isAuto ? 'pointer-events-none' : ''}`}>
                            {EMOTION_PRESETS.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => patch({ preset: p.id })}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${!isAuto && s.preset === p.id ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="em-anim space-y-2.5">
                        <Slider label="Эмоциональность" value={s.expressiveness} disabled={isAuto} onChange={(v) => patch({ expressiveness: v })} />
                        <Slider label="Энергичность" value={s.energy} disabled={isAuto} onChange={(v) => patch({ energy: v })} />
                        <Slider label="Теплота" value={s.warmth} disabled={isAuto} onChange={(v) => patch({ warmth: v })} />
                        {/* Скорость пишется в voiceRate — то же поле, что и в
                            голосовых настройках, второго источника правды нет.
                            Она работает и в авто-режиме, поэтому не гаснет. */}
                        <Slider label="Скорость" value={Math.round(((state.voiceRate || 1) - 0.5) / 1.5 * 100)} onChange={(v) => updateState({ voiceRate: +(0.5 + (v / 100) * 1.5).toFixed(1) })} />
                    </div>

                    <p className="em-anim text-xs text-gray-400 leading-relaxed px-1">
                        В голосовом режиме подачу можно менять на лету — просто скажите «говори спокойнее» или «будь энергичнее». Такая смена действует только до конца разговора и не меняет настройки здесь.
                    </p>
                </div>
            </div>
        </div>
    );
}
