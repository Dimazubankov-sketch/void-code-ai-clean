import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { VoiceModeOrb } from '@/features/chat/VoiceModeOrb';
import { VOICE_MODE_PHASE } from '@/shared/lib/useVoiceMode';
import { VOICE_PRESETS } from '@/features/settings/VoiceSettings';
import { useFishVoices } from '@/shared/lib/useOpenAiTts';
import { VoiceModeSettings } from '@/features/chat/VoiceModeSettings';

// ==========================================
// VoiceModeOverlay — полноэкранный UI разговорного режима
// ==========================================
// Portal прямо в document.body — тот же приём, что и у полноэкранного
// композера в ChatView.jsx: рендерить оверлей внутри дерева с чужим
// z-index/position означало бы риск, что он окажется «под» контентом.
//
// Задача этого раунда: без нажатий — Voice Mode слушает сразу после
// открытия (см. useVoiceMode.open), поэтому орб больше не подписан
// текстом «тапни, чтобы говорить». Тап по орбу оставлен опциональной
// подстраховкой (мгновенно завершить фразу / перебить руками), но
// пользоваться им не обязательно.

const PHASE_LABELS = {
    [VOICE_MODE_PHASE.IDLE]: 'Говори — я слушаю…',
    [VOICE_MODE_PHASE.LISTENING]: 'Слушаю…',
    [VOICE_MODE_PHASE.THINKING]: 'Думаю…',
    [VOICE_MODE_PHASE.SPEAKING]: 'Сара говорит… (заговори, чтобы перебить)',
    [VOICE_MODE_PHASE.ERROR]: 'Что-то пошло не так',
    [VOICE_MODE_PHASE.LIMIT]: 'Лимит озвучки исчерпан',
};

// Кнопка с GSAP-анимацией нажатия (задача 4) — через useGSAP/contextSafe,
// как рекомендует gsap-react skill: сами обработчики создаются ОДИН раз
// внутри useGSAP (получаем contextSafe вторым параметром колбэка) и
// сохраняются в рефах — так они гарантированно попадают в GSAP-контекст
// компонента и корректно подчищаются при размонтировании.
function PressIconButton({ onClick, title, className, children }) {
    const btnRef = useRef(null);
    const pressRef = useRef(() => {});
    const releaseRef = useRef(() => {});

    useGSAP((context, contextSafe) => {
        pressRef.current = contextSafe(() => {
            gsap.to(btnRef.current, { scale: 0.85, duration: 0.1, ease: 'power2.out', overwrite: 'auto' });
        });
        releaseRef.current = contextSafe(() => {
            gsap.to(btnRef.current, { scale: 1, duration: 0.3, ease: 'back.out(2.5)', overwrite: 'auto' });
        });
    }, { scope: btnRef });

    return (
        <button
            ref={btnRef}
            onClick={onClick}
            onPointerDown={() => pressRef.current()}
            onPointerUp={() => releaseRef.current()}
            onPointerLeave={() => releaseRef.current()}
            title={title}
            className={className}
        >
            {children}
        </button>
    );
}

// Компактный выбор голоса прямо внутри Voice Mode — «модель» (Fish/OpenAI)
// здесь сознательно не трогаем, только список голосов ТЕКУЩЕГО провайдера
// (тот же провайдер и голос, что и в обычном чате/Настройках — отдельной
// системы голосов нет).
function VoicePicker({ voices, selectedId, onChoose, onClose }) {
    return (
        <div className="fixed inset-0 z-[230] bg-black/40 backdrop-blur-sm flex items-end sm:items-center sm:justify-center fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-[#150d28] w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl shadow-2xl slide-in-right max-h-[70vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                    <h4 className="font-extrabold text-gray-900 dark:text-white">Голос</h4>
                    <button onClick={onClose} className="void-tap-target w-9 h-9 rounded-full flex items-center justify-center text-gray-400 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                        <Icons.X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {voices.map((v) => (
                        <button
                            key={v.id || 'default'}
                            onClick={() => onChoose(v.id)}
                            className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-colors ${selectedId === v.id ? 'bg-gray-100 dark:bg-white/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                        >
                            <span>
                                <span className="block font-semibold text-sm text-gray-900 dark:text-white">{v.name}</span>
                                {v.desc && <span className="block text-xs text-gray-400 dark:text-white/50">{v.desc}</span>}
                            </span>
                            {selectedId === v.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] dark:text-[#8b6ef0] shrink-0" />}
                        </button>
                    ))}
                    {voices.length === 0 && <p className="text-center text-sm text-gray-400 dark:text-white/40 py-10">Список голосов загружается…</p>}
                </div>
            </div>
        </div>
    );
}

// Модалка «лимит озвучки исчерпан» (задача 2) — не тихий статус-текст, а
// явное предупреждение с иконкой. Показывается и сразу при исчерпании
// лимита во время разговора, и при каждом новом заходе в Voice Mode, пока
// лимит не сброшен (см. открытие/проверку в useVoiceMode.open).
function LimitModal({ onClose }) {
    return (
        <div className="fixed inset-0 z-[230] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 fade-in">
            <div className="bg-white dark:bg-[#150d28] w-full max-w-xs rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center slide-in-right">
                <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                    <Icons.Alert className="w-7 h-7" />
                </div>
                <h4 className="font-extrabold text-gray-900 dark:text-white mb-2">Лимит озвучки исчерпан</h4>
                <p className="text-sm text-gray-500 dark:text-white/60 mb-6 leading-relaxed">
                    Дневной лимит символов озвучки закончился. Попробуй снова чуть позже — лимит обновляется автоматически.
                </p>
                <button
                    onClick={onClose}
                    className="void-tap-target w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors"
                >
                    Закрыть
                </button>
            </div>
        </div>
    );
}

export function VoiceModeOverlay({ state, updateState, voiceMode, onClose }) {
    const { phase, muted, errorMsg, primaryTap, toggleMute, analyserRef, speechAudioRef, speechEnvelopeRef } = voiceMode;
    const [showVoicePicker, setShowVoicePicker] = useState(false);
    const [showVoiceSettings, setShowVoiceSettings] = useState(false);

    const provider = state.ttsProvider || 'fish';
    const { voices: fishVoices } = useFishVoices();
    const currentList = provider === 'openai'
        ? VOICE_PRESETS
        : fishVoices.map((v) => ({ id: v.id, name: v.title, desc: v.description }));
    const selectedVoiceId = provider === 'openai' ? (state.voicePreset || 'nova') : (state.voicePresetFish || currentList[0]?.id || '');
    const voiceLabel = (currentList.find((v) => v.id === selectedVoiceId) || currentList[0])?.name
        || (provider === 'openai' ? 'Nova' : 'Fish Audio');

    const chooseVoice = (id) => {
        if (provider === 'openai') updateState({ voicePreset: id });
        else updateState({ voicePresetFish: id });
        setShowVoicePicker(false);
    };

    // Esc закрывает Voice Mode — стандартный ожидаемый способ выйти
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isLimited = phase === VOICE_MODE_PHASE.LIMIT;
    // muted маскирует отображаемую фазу под «покой», но не должен
    // перекрывать LIMIT — это отдельный, более важный статус.
    const displayPhase = isLimited ? VOICE_MODE_PHASE.LIMIT : (muted ? VOICE_MODE_PHASE.IDLE : phase);
    const statusText = isLimited
        ? PHASE_LABELS[VOICE_MODE_PHASE.LIMIT]
        : muted
            ? 'Микрофон отключён'
            : (phase === VOICE_MODE_PHASE.ERROR && errorMsg ? errorMsg : PHASE_LABELS[phase]);

    return createPortal(
        <div className="fixed inset-0 z-[220] bg-white dark:bg-gradient-to-b dark:from-[#1a1030] dark:to-[#0d0819] flex flex-col items-center justify-between py-8 sm:py-10 px-6 fade-in">
            {/* Выбор голоса — тап по названию вверху. Отдельной кнопки
                закрытия здесь больше нет (задача: единственный крестик — у
                микрофона внизу), сам оверлей не закрывается кликом сюда. */}
            <div className="w-full flex items-center justify-between">
                <button
                    onClick={() => setShowVoicePicker(true)}
                    className="void-tap-target flex items-center gap-1.5 text-gray-400 dark:text-white/60 hover:text-gray-900 dark:hover:text-white text-xs font-semibold uppercase tracking-wide transition-colors"
                >
                    {voiceLabel}
                    <Icons.ChevronRight className="w-3.5 h-3.5" />
                </button>
                {/* Голосовые настройки — кнопка-ползунки в правом верхнем углу */}
                <button
                    onClick={() => setShowVoiceSettings(true)}
                    title="Голосовые настройки"
                    className="void-tap-target w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white flex items-center justify-center transition-colors"
                >
                    <Icons.Sliders className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-8">
                <VoiceModeOrb phase={displayPhase} analyserRef={analyserRef} speechAudioRef={speechAudioRef} speechEnvelopeRef={speechEnvelopeRef} onClick={(muted || isLimited) ? undefined : primaryTap} size={200} />
                <p className={`text-base font-semibold min-h-[1.5em] text-center max-w-xs ${isLimited ? 'text-red-500' : 'text-gray-700 dark:text-white/80'}`}>{statusText}</p>
            </div>

            <div className="flex items-center gap-6">
                {/* Задача 5: выключенный микрофон — перечёркнутая иконка
                    микрофона (MicOff), а не «звук выключен» (VolumeX) —
                    это разные вещи, раньше здесь было перепутано. */}
                <PressIconButton
                    onClick={toggleMute}
                    title={muted ? 'Включить микрофон' : 'Отключить микрофон'}
                    className={`void-tap-target w-14 h-14 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20'}`}
                >
                    {muted ? <Icons.MicOff className="w-6 h-6" /> : <Icons.Mic className="w-6 h-6" />}
                </PressIconButton>
                <PressIconButton
                    onClick={onClose}
                    title="Завершить Voice Mode"
                    className="void-tap-target w-14 h-14 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                >
                    <Icons.X className="w-6 h-6" />
                </PressIconButton>
            </div>

            {showVoicePicker && (
                <VoicePicker
                    voices={currentList}
                    selectedId={selectedVoiceId}
                    onChoose={chooseVoice}
                    onClose={() => setShowVoicePicker(false)}
                />
            )}

            {showVoiceSettings && (
                <VoiceModeSettings state={state} updateState={updateState} onClose={() => setShowVoiceSettings(false)} />
            )}

            {isLimited && <LimitModal onClose={onClose} />}
        </div>,
        document.body,
    );
}

