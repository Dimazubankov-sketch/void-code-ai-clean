import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '@/shared/ui/Icons';
import { VoiceModeOrb } from '@/features/chat/VoiceModeOrb';
import { VOICE_MODE_PHASE } from '@/shared/lib/useVoiceMode';
import { VOICE_PRESETS } from '@/features/settings/VoiceSettings';
import { useFishVoices } from '@/shared/lib/useOpenAiTts';

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
};

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

export function VoiceModeOverlay({ state, updateState, voiceMode, onClose }) {
    const { phase, muted, errorMsg, primaryTap, toggleMute, analyserRef } = voiceMode;
    const [showVoicePicker, setShowVoicePicker] = useState(false);

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

    const displayPhase = muted ? VOICE_MODE_PHASE.IDLE : phase;
    const statusText = muted
        ? 'Микрофон отключён'
        : (phase === VOICE_MODE_PHASE.ERROR && errorMsg ? errorMsg : PHASE_LABELS[phase]);

    return createPortal(
        <div className="fixed inset-0 z-[220] bg-white dark:bg-gradient-to-b dark:from-[#1a1030] dark:to-[#0d0819] flex flex-col items-center justify-between py-8 sm:py-10 px-6 fade-in">
            {/* Выбор голоса — тап по названию вверху. Отдельной кнопки
                закрытия здесь больше нет (задача: единственный крестик — у
                микрофона внизу), сам оверлей не закрывается кликом сюда. */}
            <button
                onClick={() => setShowVoicePicker(true)}
                className="void-tap-target flex items-center gap-1.5 text-gray-400 dark:text-white/60 hover:text-gray-900 dark:hover:text-white text-xs font-semibold uppercase tracking-wide transition-colors"
            >
                {voiceLabel}
                <Icons.ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="flex-1 flex flex-col items-center justify-center gap-8">
                <VoiceModeOrb phase={displayPhase} analyserRef={analyserRef} onClick={muted ? undefined : primaryTap} size={200} />
                <p className="text-gray-700 dark:text-white/80 text-base font-semibold min-h-[1.5em] text-center max-w-xs">{statusText}</p>
            </div>

            <div className="flex items-center gap-6">
                <button
                    onClick={toggleMute}
                    title={muted ? 'Включить микрофон' : 'Отключить микрофон'}
                    className={`void-tap-target w-14 h-14 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20'}`}
                >
                    {muted ? <Icons.VolumeX className="w-6 h-6" /> : <Icons.Mic className="w-6 h-6" />}
                </button>
                <button
                    onClick={onClose}
                    title="Завершить Voice Mode"
                    className="void-tap-target w-14 h-14 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                >
                    <Icons.X className="w-6 h-6" />
                </button>
            </div>

            {showVoicePicker && (
                <VoicePicker
                    voices={currentList}
                    selectedId={selectedVoiceId}
                    onChoose={chooseVoice}
                    onClose={() => setShowVoicePicker(false)}
                />
            )}
        </div>,
        document.body,
    );
}
