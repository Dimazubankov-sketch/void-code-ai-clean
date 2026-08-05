import { useRef } from 'react';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { VoiceWaveMic } from '@/features/chat/VoiceWaveMic';

// ==========================================
// ChatInputBar — единое поле ввода для ВСЕХ чатов приложения
// ==========================================
// Используется в основном умном чате, чате оркестратора, чате агента и в
// «Оповещениях агентов» (единый чат оркестратора). Даёт одинаковый вид и
// одинаковый UX микрофона (запись → «×» отмена → квадрат-стоп → «Преобразование
// в текст») везде, где есть поле ввода сообщения.
// selectedImage/onSelectImage/onClearImage — опциональны: если переданы,
// слева появляется «+» для прикрепления фото/документа (как в основном чате).

export function ChatInputBar({
    value,
    onChange,
    onSend,
    lang = 'ru',
    voiceLang = 'ru-RU',
    placeholder,
    disabled = false,
    autoFocus = false,
    selectedImage = null,
    onSelectImage = null,
    onClearImage = null,
}) {
    const voice = useVoiceRecorder((text) => {
        onChange(((value || '') + (value ? ' ' : '') + text).trim());
    }, voiceLang);
    const fileInputRef = useRef(null);

    const canSend = !!((value || '').trim() || selectedImage) && !disabled && !voice.busy;
    const canAttach = typeof onSelectImage === 'function';

    return (
        <div className="relative">
            {selectedImage && (
                <div className="absolute -top-16 left-2 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder fade-in group z-10">
                    <img src={selectedImage} className="h-14 w-14 object-cover rounded-lg" alt="" />
                    <button onClick={() => onClearImage && onClearImage()} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}
            <div className="flex items-end bg-white dark:bg-darkCard rounded-3xl border border-gray-200 dark:border-darkBorder shadow-md focus-within:ring-4 focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4] transition-all relative min-h-[52px]">
                {canAttach && (
                    <>
                        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            const r = new FileReader();
                            r.onloadend = () => onSelectImage(r.result);
                            r.readAsDataURL(file);
                            e.target.value = '';
                        }} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Прикрепить фото или документ"
                            className="void-tap-target flex-shrink-0 ml-1.5 mb-2 p-2 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center z-20"
                        >
                            <Icons.Plus className="w-5 h-5" />
                        </button>
                    </>
                )}
                {/* Плейсхолдер фазы «Преобразование в текст» */}
                {voice.transcribing && !value && (
                    <div className={`void-transcribe-hint absolute ${canAttach ? 'left-12' : 'left-5'} right-24 top-0 py-3.5 pointer-events-none text-[#5b32d4] dark:text-purple-300 text-sm font-semibold truncate z-10`}>
                        {t(lang, 'chat.transcribing')}…
                    </div>
                )}
                {/* Анимация записи — на всё поле (GSAP-эквалайзер, см. VoiceWaveMic) */}
                {voice.recording && (
                    <div className={`absolute inset-0 z-10 rounded-3xl bg-[#f3effd]/95 dark:bg-purple-900/40 backdrop-blur-sm flex items-center ${canAttach ? 'pl-12' : 'pl-5'} pr-24 pointer-events-none fade-in`}>
                        <VoiceWaveMic analyserRef={voice.analyserRef} className="text-[#5b32d4] dark:text-purple-300" />
                    </div>
                )}
                <textarea
                    autoFocus={autoFocus}
                    value={value}
                    readOnly={voice.busy}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) onSend(); } }}
                    rows={1}
                    placeholder={voice.busy ? '' : placeholder}
                    className={`flex-1 min-w-0 ${canAttach ? 'pl-2' : 'pl-4'} pr-24 py-3 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32 text-sm leading-6 ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && value ? 'opacity-40' : ''}`}
                />
                {voice.supported && (
                    <button
                        onClick={() => voice.recording ? voice.stop() : (!voice.transcribing && voice.start())}
                        title={voice.recording ? t(lang, 'chat.stopRecording') : t(lang, 'home.voiceInput')}
                        disabled={voice.transcribing}
                        className={`void-tap-target absolute right-11 bottom-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all z-20 ${voice.recording ? 'bg-[#5b32d4] text-white voice-pulse-purple' : voice.transcribing ? 'bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300' : 'text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                        {voice.recording ? <Icons.Square className="w-4 h-4" /> : voice.transcribing ? <Icons.Spinner className="w-4 h-4" /> : <Icons.Mic className="w-4 h-4" />}
                    </button>
                )}
                <button
                    onClick={() => canSend && onSend()}
                    disabled={!canSend}
                    className="void-tap-target absolute right-2 bottom-2 w-8 h-8 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-xl flex items-center justify-center transition-all shadow-sm z-20"
                >
                    <Icons.ArrowUp className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
