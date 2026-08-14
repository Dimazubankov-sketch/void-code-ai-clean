import { useEffect } from 'react';
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
// композера в ChatView.jsx (см. комментарий там): рендерить оверлей внутри
// дерева с собственным z-index/position означало бы риск, что он окажется
// «под» контентом из-за чужого стекингового контекста.

const PHASE_LABELS = {
    [VOICE_MODE_PHASE.IDLE]: 'Тапни, чтобы говорить',
    [VOICE_MODE_PHASE.LISTENING]: 'Слушаю…',
    [VOICE_MODE_PHASE.TRANSCRIBING]: 'Распознаю…',
    [VOICE_MODE_PHASE.THINKING]: 'Думаю…',
    [VOICE_MODE_PHASE.SPEAKING]: 'Сара говорит… (тапни, чтобы перебить)',
    [VOICE_MODE_PHASE.ERROR]: 'Что-то пошло не так',
};

export function VoiceModeOverlay({ state, voiceMode, onClose }) {
    const { phase, muted, errorMsg, primaryTap, toggleMute, analyserRef } = voiceMode;

    const provider = state.ttsProvider || 'fish';
    const { voices: fishVoices } = useFishVoices();
    const currentList = provider === 'openai'
        ? VOICE_PRESETS
        : fishVoices.map((v) => ({ id: v.id, name: v.title }));
    const selectedVoiceId = provider === 'openai' ? (state.voicePreset || 'nova') : (state.voicePresetFish || currentList[0]?.id || '');
    const voiceLabel = (currentList.find((v) => v.id === selectedVoiceId) || currentList[0])?.name
        || (provider === 'openai' ? 'Nova' : 'Fish Audio');

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
        <div className="fixed inset-0 z-[220] bg-gradient-to-b from-[#1a1030] to-[#0d0819] flex flex-col items-center justify-between py-8 sm:py-10 px-6 fade-in">
            <div className="w-full flex items-center justify-between">
                <span className="text-white/50 text-xs font-semibold uppercase tracking-wide">{voiceLabel}</span>
                <button
                    onClick={onClose}
                    title="Завершить Voice Mode"
                    className="void-tap-target w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <Icons.X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-8">
                <VoiceModeOrb phase={displayPhase} analyserRef={analyserRef} onClick={muted ? undefined : primaryTap} size={200} />
                <p className="text-white/80 text-base font-semibold min-h-[1.5em] text-center max-w-xs">{statusText}</p>
            </div>

            <div className="flex items-center gap-6">
                <button
                    onClick={toggleMute}
                    title={muted ? 'Включить микрофон' : 'Отключить микрофон'}
                    className={`void-tap-target w-14 h-14 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-white/90 text-[#1a1030]' : 'bg-white/10 text-white hover:bg-white/20'}`}
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
        </div>,
        document.body,
    );
}
