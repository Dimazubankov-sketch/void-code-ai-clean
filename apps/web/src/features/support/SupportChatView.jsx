import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { goBack } from '@/shared/lib/navigation';
import { compressImageFiles } from '@/shared/lib/imageCompress';
import { sendSupportMessage } from '@/shared/api/chat';
import { MessageRenderer } from '@/features/chat/MessageRenderer';
import { UserMessageBubble } from '@/features/chat/UserMessageBubble';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// SupportChatView — чат с ИИ-техподдержкой (Void Mini)
// ==========================================
// Полностью изолирован от обычного чата: своя, локальная история
// сообщений (не попадает в state.chatSessions, не расходует дневной/
// недельный лимит — см. SupportService на бэкенде), свой жёсткий
// системный промпт (задан ТОЛЬКО на сервере, см. support.service.ts).
//
// Два входа в этот экран: круглая кнопка в «Сведения → Справочный центр»
// (см. FaqSection в InfoView.jsx) и такая же — в «Помощи» (GuideView.jsx),
// см. HomeView.jsx → currentView: 'guide'.

const TOPICS = [
    { id: 'login', label: 'Не получается войти в аккаунт', icon: 'Lock' },
    { id: 'billing', label: 'Проблема с оплатой или тарифом', icon: 'Card' },
    { id: 'generation', label: 'Ошибка при генерации ответа или изображения', icon: 'Alert' },
    { id: 'voice', label: 'Не работает голосовой ввод или озвучка', icon: 'Volume2' },
    { id: 'agents', label: 'Вопрос по агентам или оркестратору', icon: 'Robot' },
];

// Грубая, но практичная эвристика: агент по системному промпту либо решает
// проблему и прощается, либо просит почту и прощается — в обоих случаях
// финальная реплика почти всегда содержит одну из этих фраз. Без этого
// клиент не может узнать, что диалог по сути завершён (сервер не передаёт
// отдельный флаг, а сам промпт менять нельзя — он задан по ТЗ дословно).
const ENDING_PATTERNS = [
    'до свидания', 'всего доброго', 'хорошего дня', 'хорошего вечера',
    'обращайтесь', 'рад был помочь', 'рады были помочь', 'счастливо',
    'в течение 3', 'в течение трёх', 'в течение трех', 'решат проблему',
];
function looksLikeEnding(text) {
    const low = (text || '').toLowerCase();
    return ENDING_PATTERNS.some((p) => low.includes(p));
}

export function SupportChatView({ state, updateState, onClose }) {
    const [topic, setTopic] = useState(null); // null → экран выбора темы
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [images, setImages] = useState([]);
    const [generating, setGenerating] = useState(false);
    const [ended, setEnded] = useState(false);
    const fileInputRef = useRef(null);
    const scrollRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, generating]);

    const handleBack = () => { if (onClose) onClose(); else goBack(state, updateState, 'guide'); };

    const pushAndSend = async (text, imgs = []) => {
        const clean = (text || '').trim();
        if (!clean && imgs.length === 0) return;
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages((m) => [...m, { role: 'user', content: clean, images: imgs }]);
        setInput('');
        setImages([]);
        if (textareaRef.current) textareaRef.current.style.height = '';
        setGenerating(true);
        try {
            const reply = await sendSupportMessage(clean, history, imgs);
            setMessages((m) => [...m, { role: 'assistant', content: reply }]);
            if (looksLikeEnding(reply)) setEnded(true);
        } catch {
            setMessages((m) => [...m, { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз чуть позже.' }]);
        } finally {
            setGenerating(false);
        }
    };

    const pickTopic = (t) => { setTopic(t.id); pushAndSend(t.label, []); };
    const pickCustom = () => { setTopic('custom'); };

    const addFiles = (fileList) => {
        const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/')).slice(0, 4 - images.length);
        if (files.length === 0) return;
        compressImageFiles(files).then((results) => setImages((prev) => [...prev, ...results]));
    };

    if (!topic) {
        return <SupportTopicScreen onBack={handleBack} onPick={pickTopic} onCustom={pickCustom} />;
    }

    const statusText = generating ? 'Агент пишет…' : ended ? 'Агент покинул диалог' : (messages.length === 0 ? 'Агент вступил в диалог' : null);

    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            {/* Шапка */}
            <div className="shrink-0 flex items-center gap-3 px-4 pt-6 pb-3 bg-[#f8f9fc]/95 dark:bg-darkBg/95 backdrop-blur-md border-b border-gray-100 dark:border-darkBorder">
                <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                <div className="min-w-0">
                    <h2 className="text-lg font-extrabold dark:text-white truncate">Техподдержка</h2>
                    {statusText && (
                        <p className={`text-xs font-semibold truncate ${generating ? 'text-[#5b32d4] dark:text-purple-300' : ended ? 'text-gray-400' : 'text-emerald-500'}`}>
                            {statusText}
                        </p>
                    )}
                </div>
            </div>

            {/* Сообщения */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6">
                <div className="max-w-2xl mx-auto space-y-5">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'user' ? (
                                <div className="max-w-[85%]"><UserMessageBubble msg={msg} /></div>
                            ) : (
                                <div className="max-w-[85%] p-4 rounded-3xl rounded-tl-sm bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder void-selectable">
                                    <MessageRenderer content={msg.content} />
                                </div>
                            )}
                        </div>
                    ))}
                    {generating && (
                        <div className="flex justify-start">
                            <TypingDots />
                        </div>
                    )}
                </div>
            </div>

            {/* Поле ввода */}
            <div className="shrink-0 p-3 sm:p-4 border-t border-gray-100 dark:border-darkBorder bg-[#f8f9fc]/95 dark:bg-darkBg/95 backdrop-blur-md">
                <div className="max-w-2xl mx-auto">
                    {images.length > 0 && (
                        <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-hide">
                            {images.map((src, i) => (
                                <div key={i} className="relative shrink-0">
                                    <img src={src} className="w-14 h-14 object-cover rounded-xl border border-gray-200 dark:border-darkBorder" alt="" />
                                    <button onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md"><Icons.X className="w-3 h-3" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <input type="file" ref={fileInputRef} multiple accept="image/jpeg, image/png, image/webp" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                    <div className="flex items-end bg-white dark:bg-darkCard rounded-3xl border border-gray-200 dark:border-darkBorder shadow-md focus-within:ring-4 focus-within:ring-[#5b32d4]/10 focus-within:border-[#5b32d4] transition-all relative min-h-[52px]">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={ended}
                            title="Прикрепить фото"
                            className="void-tap-target flex-shrink-0 ml-1.5 mb-1.5 p-2 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors flex items-center justify-center z-20 disabled:opacity-40"
                        >
                            <Icons.Plus className="w-5 h-5" />
                        </button>
                        <textarea
                            ref={textareaRef}
                            value={input}
                            disabled={ended}
                            onChange={(e) => {
                                setInput(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pushAndSend(input, images); } }}
                            rows={1}
                            placeholder={ended ? 'Диалог завершён' : 'Опишите проблему…'}
                            className="flex-1 min-w-0 pl-2 pr-14 py-3 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none max-h-32 text-sm leading-6 disabled:opacity-50"
                        />
                        <button
                            onClick={() => pushAndSend(input, images)}
                            disabled={ended || generating || (!input.trim() && images.length === 0)}
                            className="void-tap-target absolute right-2 bottom-2 w-8 h-8 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-xl flex items-center justify-center transition-all shadow-sm z-20"
                        >
                            <Icons.ArrowUp className="w-4 h-4" />
                        </button>
                    </div>
                    {ended && (
                        <button onClick={() => { setTopic(null); setMessages([]); setEnded(false); }} className="w-full mt-3 py-3 rounded-2xl border border-gray-200 dark:border-darkBorder text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            Начать новый диалог
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ==========================================
// Экран выбора темы — показывается ДО начала чата
// ==========================================
function SupportTopicScreen({ onBack, onPick, onCustom }) {
    return (
        <div className="flex flex-col h-full bg-[#f8f9fc] dark:bg-darkBg void-view-enter w-full">
            <div className="shrink-0 flex items-center gap-3 px-4 pt-6 pb-3">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                <h2 className="text-lg font-extrabold dark:text-white">Техподдержка</h2>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-8">
                <div className="max-w-lg mx-auto pt-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center mb-4">
                        <Icons.MessageSquare className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-extrabold dark:text-white mb-1">С чем помочь?</h3>
                    <p className="text-sm text-gray-400 mb-6">Выберите ближайшую по смыслу тему — так агент быстрее разберётся в проблеме.</p>

                    <div className="space-y-2">
                        {TOPICS.map((t) => {
                            const IconComp = Icons[t.icon] || Icons.Help;
                            return (
                                <button key={t.id} onClick={() => onPick(t)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder text-left hover:border-[#5b32d4]/40 hover:bg-[#faf9ff] dark:hover:bg-purple-900/10 transition-colors">
                                    <IconComp className="w-5 h-5 text-[#5b32d4] dark:text-purple-400 shrink-0" />
                                    <span className="flex-1 text-sm font-bold text-gray-800 dark:text-gray-100">{t.label}</span>
                                    <Icons.ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                                </button>
                            );
                        })}
                        <button onClick={onCustom} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors mt-3">
                            <Icons.Pencil className="w-4 h-4" /> Другое — опишу проблему сам
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// TypingDots — «Агент печатает…», три бегущие точки на GSAP
// ==========================================
function TypingDots() {
    const scope = useRef(null);
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.to('.support-typing-dot', { autoAlpha: 1, y: -3, duration: 0.4, stagger: { each: 0.16, repeat: -1, yoyo: true }, ease: 'sine.inOut' });
    }, { scope });

    return (
        <div ref={scope} className="px-4 py-3.5 rounded-3xl rounded-tl-sm bg-white dark:bg-darkCard border border-gray-100 dark:border-darkBorder flex items-center gap-1">
            <span className="support-typing-dot w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 opacity-40" />
            <span className="support-typing-dot w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 opacity-40" />
            <span className="support-typing-dot w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 opacity-40" />
        </div>
    );
}
