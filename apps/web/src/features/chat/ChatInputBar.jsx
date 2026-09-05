import { useRef, useState, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { LiquidMicButton } from '@/shared/ui/LiquidMicButton';
import { RecordingPill } from '@/shared/ui/RecordingPill';

// Задача 11: после скольких строк текста показывать кнопку полноэкранного
// режима. leading-6 у textarea = 24px на строку.
const LINE_HEIGHT_PX = 24;
const FULLSCREEN_TRIGGER_LINES = 3;

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
    // Новое: агентский чат передаёт onPlusClick — «+» открывает его
    // собственное меню (камера/фото/файлы/скиллы/голос/коннекторы)
    // вместо обычного мгновенного выбора картинки. Остальные потребители
    // компонента (например, почтовый чат) этот проп не передают —
    // поведение «+» для них не меняется.
    onPlusClick = null,
    // onVoiceMode — если передан, кнопка отправки на ПУСТОМ поле
    // превращается в кнопку входа в голосовой режим (та же логика
    // мик/стрелка, что и в основном чате). Не передан — кнопка всегда
    // обычная стрелка отправки, как было.
    onVoiceMode = null,
}) {
    const voice = useVoiceRecorder((text) => {
        onChange(((value || '') + (value ? ' ' : '') + text).trim());
    }, voiceLang);
    const fileInputRef = useRef(null);
    const textareaRef = useRef(null);
    const wrapRef = useRef(null);

    // ==========================================
    // Задача 11 — полноэкранный режим поля ввода
    // ==========================================
    const [expanded, setExpanded] = useState(false);
    const [manyLines, setManyLines] = useState(false);
    const collapsedRectRef = useRef(null);

    // Меряем реальную высоту textarea при каждом изменении текста, чтобы
    // понять, дошли ли мы до 3-й строки — просто считать переносы \n
    // недостаточно, строка переносится и визуально при обычном wrap.
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el || expanded) return;
        const prevMaxHeight = el.style.maxHeight;
        el.style.maxHeight = 'none';
        const lines = Math.round(el.scrollHeight / LINE_HEIGHT_PX);
        el.style.maxHeight = prevMaxHeight;
        setManyLines(lines >= FULLSCREEN_TRIGGER_LINES);
    }, [value, expanded]);

    const { contextSafe } = useGSAP({ scope: wrapRef });

    const enterFullscreen = contextSafe(() => {
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        collapsedRectRef.current = rect;
        setExpanded(true);
        gsap.set(el, {
            position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            zIndex: 100, margin: 0,
        });
        gsap.to(el, {
            top: 12, left: 12, right: 12, bottom: 12, width: 'auto', height: 'auto',
            duration: 0.4, ease: 'power3.inOut',
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
    });

    const exitFullscreen = contextSafe(() => {
        const el = wrapRef.current;
        const rect = collapsedRectRef.current;
        if (!el || !rect) { setExpanded(false); return; }
        gsap.to(el, {
            top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: 'auto', bottom: 'auto',
            duration: 0.35, ease: 'power3.inOut',
            onComplete: () => {
                gsap.set(el, { clearProps: 'position,top,left,right,bottom,width,height,zIndex,margin' });
                setExpanded(false);
            },
        });
    });

    // Задача 12 — отступ (красная строка): вставляет отступ в позицию
    // курсора. Tab внутри textarea штатно переключает фокус на соседний
    // элемент, поэтому перехватываем его и вставляем отступ вручную.
    const insertIndent = () => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? (value || '').length;
        const end = el.selectionEnd ?? start;
        const next = (value || '').slice(0, start) + '\u00A0\u00A0\u00A0\u00A0' + (value || '').slice(end);
        onChange(next);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + 4;
        });
    };

    const canSend = !!((value || '').trim() || selectedImage) && !disabled && !voice.busy;
    const canAttach = typeof onSelectImage === 'function' || typeof onPlusClick === 'function';
    // Показываем вход в голосовой режим вместо стрелки только когда поле
    // реально пустое (иначе непонятно, отправляется текст или начинается
    // разговор) и обработчик действительно передан.
    const showVoiceModeButton = !!onVoiceMode && !(value || '').trim() && !selectedImage;

    return (
        <div className="relative">
            {expanded && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99] fade-in" onClick={exitFullscreen} />}
            {selectedImage && (
                <div className="absolute -top-16 left-2 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder fade-in group z-10">
                    <img src={selectedImage} className="h-14 w-14 object-cover rounded-lg" alt="" />
                    <button onClick={() => onClearImage && onClearImage()} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}
            <div
                ref={wrapRef}
                className={`flex items-end bg-white dark:bg-darkCard rounded-3xl border border-gray-200 dark:border-darkBorder shadow-md focus-within:ring-4 focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4] transition-colors relative min-h-[52px] ${expanded ? 'flex-col items-stretch !rounded-2xl shadow-2xl' : ''}`}
            >
                {canAttach && !expanded && (
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
                            onClick={() => (onPlusClick ? onPlusClick() : fileInputRef.current?.click())}
                            title="Прикрепить фото или документ"
                            className="void-tap-target flex-shrink-0 ml-1.5 mb-2 p-2 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center z-20"
                        >
                            <Icons.Plus className="w-5 h-5" />
                        </button>
                    </>
                )}
                {/* Плейсхолдер фазы «Преобразование в текст» */}
                {voice.transcribing && !value && (
                    <div className="void-transcribe-hint absolute inset-x-0 top-0 py-3.5 pointer-events-none text-gray-500 dark:text-gray-400 text-sm font-semibold text-center z-10">
                        {t(lang, 'chat.transcribing')}…
                    </div>
                )}
                {/* Анимация записи — на всё поле (GSAP-эквалайзер, см. VoiceWaveMic) */}
                {voice.recording && (
                    <div className="absolute inset-0 z-10 rounded-3xl bg-white/80 dark:bg-darkCard/80 backdrop-blur-sm flex items-center justify-end pr-14 pointer-events-none fade-in">
                        <RecordingPill voice={voice} />
                    </div>
                )}
                {/* Задача 11: кнопка полноэкранного режима — без обводки,
                    появляется только когда текста от 3 строк и выше (или
                    всегда видна кнопка сворачивания, пока мы уже в
                    полноэкранном режиме). */}
                {(manyLines || expanded) && (
                    <button
                        onClick={expanded ? exitFullscreen : enterFullscreen}
                        title={expanded ? 'Свернуть поле ввода' : 'Развернуть на весь экран'}
                        className={`void-tap-target absolute z-20 p-1.5 text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 transition-colors ${expanded ? 'top-3 right-3' : 'top-2 right-2'}`}
                    >
                        {expanded ? <Icons.Minimize className="w-4 h-4" /> : <Icons.Maximize className="w-4 h-4" />}
                    </button>
                )}
                {/* Задача 12: кнопка отступа (красная строка) — видна только
                    в развёрнутом режиме, чтобы не загромождать компактную
                    строку ввода. */}
                {expanded && (
                    <button
                        onClick={insertIndent}
                        title="Добавить отступ (красная строка)"
                        className="void-tap-target absolute z-20 top-3 left-3 p-1.5 text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 transition-colors"
                    >
                        <Icons.Indent className="w-4 h-4" />
                    </button>
                )}
                <textarea
                    ref={textareaRef}
                    autoFocus={autoFocus}
                    value={value}
                    readOnly={voice.busy}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !expanded) { e.preventDefault(); if (canSend) onSend(); }
                        if (e.key === 'Tab') { e.preventDefault(); insertIndent(); }
                    }}
                    rows={1}
                    placeholder={voice.busy ? '' : placeholder}
                    className={`flex-1 min-w-0 ${canAttach && !expanded ? 'pl-2' : 'pl-4'} pr-24 py-3 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none text-sm leading-6 ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && value ? 'opacity-40' : ''} ${expanded ? 'w-full !max-h-none flex-1 pt-10' : 'max-h-32'}`}
                />
                {voice.supported && (
                    <LiquidMicButton
                        voice={voice}
                        size="md"
                        bordered
                        title={t(lang, 'home.voiceInput')}
                        stopTitle={t(lang, 'chat.stopRecording')}
                        className="absolute right-12 bottom-1.5 z-20"
                    />
                )}
                <button
                    onClick={() => (showVoiceModeButton ? onVoiceMode() : (canSend && onSend()))}
                    disabled={!showVoiceModeButton && !canSend}
                    title={showVoiceModeButton ? 'Voice Mode' : undefined}
                    // Тот же приём, что и в основном чате: пустое поле —
                    // кнопка входа в голосовой режим (волна), есть текст —
                    // обычная стрелка отправки.
                    className="void-tap-target absolute right-1.5 bottom-1.5 w-10 h-10 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-sm z-20"
                >
                    {showVoiceModeButton ? <Icons.Waveform className="w-4 h-4" /> : <Icons.ArrowUp className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
