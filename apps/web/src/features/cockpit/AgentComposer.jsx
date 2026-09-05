import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';
import { LiquidMicButton } from '@/shared/ui/LiquidMicButton';
import { RecordingPill } from '@/shared/ui/RecordingPill';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { useExpandableComposer } from '@/shared/lib/useExpandableComposer';

// ==========================================
// AgentComposer — поле ввода для чата агента/оркестратора
// ==========================================
// Точная копия композера основного чата (ChatView.jsx): те же скругления
// (rounded-[26px]), те же размеры кнопок и отступы, та же GSAP-анимация
// высоты textarea, тот же полноэкранный режим через Portal. Раньше здесь
// стоял ChatInputBar — визуально более простой и МЕНЬШЕГО размера
// компонент, из-за чего поле ввода агента отличалось от основного чата.
// Единственная сознательная разница — здесь нет кнопки входа в Voice
// Mode: агентский чат не имеет разговорного голосового режима (см.
// пояснение в AgentChatView.jsx), поэтому кнопка отправки всегда обычная
// стрелка, а не переключатель мик/волна.
export function AgentComposer({
    value,
    onChange,
    onSend,
    onPlusClick,
    placeholder = 'Написать запрос…',
    disabled = false,
    lang = 'ru',
    voiceLang = 'ru-RU',
}) {
    const editableTextareaRef = useRef(null);
    const expandedTextareaRef = useRef(null);

    const voice = useVoiceRecorder((text) => {
        onChange(((value || '') + (value ? ' ' : '') + text).trim());
    }, voiceLang);

    const { expanded, manyChars, enterFullscreen, exitFullscreen, insertIndent } = useExpandableComposer({ value, onChange });

    const canSend = !!(value || '').trim() && !disabled && !voice.busy;

    return (
        <>
            <div
                className={`flex items-end bg-white dark:bg-darkCard rounded-[26px] border transition-colors relative ${manyChars ? 'min-h-[104px]' : ''} border-gray-200 dark:border-darkBorder focus-within:border-gray-300 dark:focus-within:border-gray-600`}
            >
                <button
                    onClick={() => (voice.recording ? voice.cancel() : onPlusClick?.())}
                    title={voice.recording ? 'Отменить запись' : undefined}
                    className="void-tap-target absolute left-3 sm:left-4 bottom-2.5 sm:bottom-3 p-2.5 sm:p-2 transition-colors rounded-full flex items-center justify-center z-20 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <Icons.Plus className={`w-6 h-6 void-plus-rotate ${voice.recording ? 'void-plus-to-x' : ''}`} />
                </button>

                {voice.recording && (
                    <div className="absolute inset-0 z-10 rounded-3xl bg-[#f3effd]/95 dark:bg-purple-900/40 backdrop-blur-sm flex items-center justify-center pl-16 pr-32 pointer-events-none fade-in">
                        <RecordingPill voice={voice} />
                    </div>
                )}
                {voice.transcribing && !value && (
                    <div className="void-transcribe-hint absolute left-14 right-32 top-0 py-5 pointer-events-none text-[#5b32d4] dark:text-purple-300 text-[16px] font-semibold truncate z-10">
                        Преобразование в текст…
                    </div>
                )}

                <textarea
                    ref={editableTextareaRef}
                    className={`w-full pl-14 pr-28 pb-5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none overflow-y-auto max-h-[220px] min-h-[64px] text-[16px] void-input-scroll ${manyChars ? 'pt-11' : 'pt-5'} ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && value ? 'opacity-40' : ''}`}
                    placeholder={voice.busy ? '' : placeholder}
                    readOnly={voice.busy}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        // Та же плавная GSAP-анимация высоты, что и в основном
                        // чате, включая корректный возврат к исходному размеру
                        // при полном удалении текста.
                        const target = e.target;
                        const prev = parseFloat(target.style.height || '0') || target.offsetHeight;
                        target.style.height = 'auto';
                        const nextH = e.target.value ? Math.min(target.scrollHeight, 220) : 0;
                        target.style.height = prev + 'px';
                        if (!nextH) {
                            gsap.to(target, {
                                height: 64, duration: 0.18, ease: 'power2.out', overwrite: true,
                                onComplete: () => { target.style.height = ''; },
                            });
                        } else {
                            gsap.to(target, { height: nextH, duration: 0.18, ease: 'power2.out', overwrite: true });
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Tab') { e.preventDefault(); insertIndent(editableTextareaRef.current); }
                    }}
                    rows={1}
                />

                {manyChars && (
                    <button
                        onClick={enterFullscreen}
                        title="Развернуть на весь экран"
                        className="void-tap-target absolute z-30 top-2.5 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 transition-colors"
                    >
                        <Icons.Maximize className="w-5 h-5" />
                    </button>
                )}

                {voice.supported && (
                    <LiquidMicButton
                        voice={voice}
                        size="lg"
                        bordered
                        title="Голосовой ввод"
                        stopTitle="Остановить запись"
                        className="absolute right-[4.25rem] sm:right-[4.5rem] bottom-2.5 sm:bottom-3 z-20"
                    />
                )}

                {/* Без Voice Mode: кнопка всегда обычная стрелка отправки. */}
                <button
                    onClick={() => canSend && onSend()}
                    disabled={!canSend}
                    title="Отправить"
                    className="void-tap-target absolute right-2.5 sm:right-3 bottom-2.5 sm:bottom-3 w-10 h-10 sm:w-11 sm:h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-md z-20"
                >
                    <Icons.ArrowUp className="w-5 h-5" />
                </button>
            </div>

            {expanded && createPortal(
                <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center sm:justify-center p-0 sm:p-4 fade-in">
                    <div className="bg-white dark:bg-darkCard w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-3xl flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                            <button
                                onClick={() => insertIndent(expandedTextareaRef.current)}
                                title="Добавить отступ (красная строка)"
                                className="void-tap-target w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Icons.Indent className="w-5 h-5" />
                            </button>
                            <span className="text-sm font-bold text-gray-400">Полноэкранный ввод</span>
                            <button
                                onClick={() => {
                                    exitFullscreen();
                                    requestAnimationFrame(() => {
                                        const el = editableTextareaRef.current;
                                        if (!el) return;
                                        el.style.height = 'auto';
                                        el.style.height = Math.min(el.scrollHeight, 220) + 'px';
                                    });
                                }}
                                title="Свернуть"
                                className="void-tap-target w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Icons.Minimize className="w-5 h-5" />
                            </button>
                        </div>
                        <textarea
                            ref={expandedTextareaRef}
                            autoFocus
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            enterKeyHint="enter"
                            onKeyDown={(e) => {
                                if (e.key === 'Tab') { e.preventDefault(); insertIndent(expandedTextareaRef.current); }
                            }}
                            placeholder={voice.busy ? '' : placeholder}
                            className="flex-1 w-full p-4 sm:p-6 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none text-[16px] leading-7"
                        />
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                            {voice.supported && (
                                <LiquidMicButton
                                    voice={voice}
                                    size="lg"
                                    bordered
                                    title="Голосовой ввод"
                                    stopTitle="Остановить запись"
                                />
                            )}
                            <button
                                onClick={() => { canSend && onSend(); exitFullscreen(); }}
                                disabled={!canSend}
                                title="Отправить"
                                className="void-tap-target w-11 h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-md"
                            >
                                <Icons.ArrowUp className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
