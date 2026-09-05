import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { AudioPlayer } from '@/features/chat/AudioPlayer';
import { ChatToolbar } from '@/features/chat/ChatToolbar';
import { CodeViewerModal } from '@/features/chat/CodeViewerModal';
import { FeedbackModal } from '@/features/chat/FeedbackModal';
import { MessageRenderer } from '@/features/chat/MessageRenderer';
import { StreamingMessage } from '@/features/chat/StreamingMessage';
import { ThinkingIndicator } from '@/features/chat/ThinkingIndicator';
import { ImageGenLoader } from '@/features/chat/ImageGenLoader';
import { GeneratedImage } from '@/features/chat/GeneratedImage';
import { ScrollDownButton } from '@/features/chat/ScrollDownButton';
import { LiquidMicButton } from '@/shared/ui/LiquidMicButton';
import { RecordingPill } from '@/shared/ui/RecordingPill';
import { pressProps, prefersReducedMotion, EASE, DUR } from '@/shared/lib/motion';
import { ModelSelector } from '@/features/chat/ModelSelector';
import { Toast } from '@/shared/ui/Toast';
import { UserMessageBubble } from '@/features/chat/UserMessageBubble';
import { ChatPlusMenu } from '@/features/chat/ChatPlusMenu';
import { ImageEditorModal } from '@/features/chat/ImageEditorModal';
import { TopHeader } from '@/features/home/TopHeader';
import { buildShareLink, dialogToText } from '@/shared/lib/shareDialog';
import { useTextToSpeech } from '@/shared/lib/useTextToSpeech';
import { useOpenAiTts } from '@/shared/lib/useOpenAiTts';
import { useVoiceRecorder } from '@/shared/lib/useVoiceRecorder';
import { getVoiceOpts } from '@/shared/lib/voiceOpts';
import { RenameChatModal, DeleteChatModal, AddToProjectModal } from '@/features/chat/ChatActionModals';
import { defaultReasoningFor, getAttachmentLimit } from '@/shared/config/models';
import { getPlanLimits } from '@/shared/config/models';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';
import { compressImageFiles } from '@/shared/lib/imageCompress';
import { useExpandableComposer } from '@/shared/lib/useExpandableComposer';


export function ChatView({ state, updateState, handleSendMessage, handleGenerateImage, messagesEndRef, chatFileInputRef, voiceMode }) {
    const lang = state.lang || 'ru';
    const activeChat = state.chatSessions.find(c => c.id === state.activeChatId) || state.chatSessions[0];
    const messages = activeChat?.messages || [];
    const [activeCodeBlock, setActiveCodeBlock] = useState(null);
    const [expandedTraceIdx, setExpandedTraceIdx] = useState(null);
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const cameraInputRef = useRef(null);
    const anyFileInputRef = useRef(null);

    // ЗАДАЧА 1 (фикс галереи на мобильных, попытка №5 — теперь по делу):
    // клик по системному пикеру (input[type=file].click()) вызываем ПЕРВОЙ
    // строкой, СИНХРОННО, прямо внутри обработчика реального тапа
    // пользователя — это и есть тот самый user-gesture, без которого iOS
    // Safari/Chrome молча отказываются показывать галерею. Никаких await/
    // setTimeout ПЕРЕД click() быть не должно.
    // Закрытие меню «+» (setShowPlusMenu(false) → React убирает оверлей
    // ChatPlusMenu из DOM) сознательно откладываем на следующий кадр через
    // requestAnimationFrame. Если снести DOM оверлея СИНХРОННО сразу после
    // click(), WKWebView/Safari иногда отменяет ещё не отрисованный
    // системный пикер — именно это раньше выглядело как «галерея не
    // открывается». requestAnimationFrame — не таймер ожидания, а лишь
    // перенос неблокирующей DOM-мутации на следующий кадр отрисовки, сам
    // click() при этом уже отработал синхронно.
    const openFilePicker = (ref) => {
        ref?.current?.click();
        requestAnimationFrame(() => setShowPlusMenu(false));
    };
    const [editingImage, setEditingImage] = useState(null); // { src, index, source } | null

    // Добавляет выбранные файлы (из галереи, камеры или файлового менеджера)
    // в state.selectedImages, соблюдая лимит по тарифу (задача 2-4:
    // 3 фото на Free, 9 на любом платном тарифе). Перед конвертацией в
    // data-URL каждое фото СЖИМАЕТСЯ (большая сторона до 1600px, JPEG
    // качество 0.8) — иначе фото с телефона (3000-4000px, несколько МБ)
    // в base64 легко превышало лимит тела запроса и Vision-запрос падал
    // с «Ошибка сервера (HTTP 413)». Не-картинки (например, выбранные
    // через «Файлы») пока не поддерживаются в Vision — на бэкенде
    // смотрятся только image_url блоки.
    const addImageFiles = (fileList) => {
        const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;
        const limit = getAttachmentLimit(state.userPlan);
        const current = state.selectedImages || [];
        const roomLeft = Math.max(0, limit - current.length);
        if (roomLeft === 0) {
            alert(`Лимит вложений на вашем тарифе — ${limit} фото за раз.`);
            return;
        }
        const toAdd = files.slice(0, roomLeft);
        if (files.length > roomLeft) {
            alert(`Можно приложить не больше ${limit} фото. Добавлены первые ${roomLeft}.`);
        }
        compressImageFiles(toAdd).then((results) => {
            updateState({ selectedImages: [...current, ...results] });
        });
    };
    const editableTextareaRef = useRef(null);
    const composerWrapRef = useRef(null);
    const expandedTextareaRef = useRef(null);
    const { expanded: composerExpanded, manyChars: composerManyChars, enterFullscreen: composerEnterFullscreen, exitFullscreen: composerExitFullscreen, insertIndent: composerInsertIndent } = useExpandableComposer({
        value: state.inputValue,
        onChange: (v) => updateState({ inputValue: v }),
    });
    const currentReasoningLevel = (state.reasoningByModel || {})[state.selectedModelId] || defaultReasoningFor(state.selectedModelId);

    // ==========================================
    // Баг-фикс: сброс высоты textarea после отправки
    // ==========================================
    // GSAP-анимация авто-высоты (onChange ниже) напрямую пишет px в
    // el.style.height. Раньше сброс происходил ТОЛЬКО в onKeyDown при
    // отправке по Enter — если сообщение отправлялось кликом по кнопке
    // (самый частый способ на мобильных, где Enter не сабмитит), инлайновая
    // высота так и оставалась «растянутой» под длинный текст, хотя
    // state.inputValue уже пустой. Общий и надёжный фикс — реагировать на
    // сам факт опустошения поля, откуда бы оно ни было очищено (кнопка,
    // Enter, голосовой ввод, программный clear), и снимать инлайн-стиль,
    // возвращая контроль CSS (min-h-[64px] из класса textarea).
    useEffect(() => {
        if (state.inputValue === '' && editableTextareaRef.current) {
            editableTextareaRef.current.style.height = '';
        }
    }, [state.inputValue]);

    // Голосовой ввод (новый UX): запись с анимацией на всём поле,
    // «+» → «×» (отмена), микрофон → квадрат (стоп) → индикатор загрузки,
    // затем «Преобразование в текст» и распознанное дописывается к тексту.
    const voice = useVoiceRecorder((text) => {
        updateState({ inputValue: ((state.inputValue || '') + (state.inputValue ? ' ' : '') + text).trim() });
    }, state.voiceLang || 'ru-RU');
    // Задача 6: запись голоса доступна только после входа — гостю вместо
    // запуска микрофона показываем модалку входа/регистрации.
    const startVoiceGuarded = () => {
        if (!state.user) { updateState({ showAuthModal: true }); return; }
        voice.start();
    };

    // Озвучка, фидбэк, шеринг. Приоритетно — через бэкенд (OpenAI TTS-1)
    // с фолбэком на Web Speech при ошибке.
    const tts = useOpenAiTts();
    // Действия над чатом теперь в нормальных окнах, а не в системных
    // prompt/confirm: те не стилизуются и обрезаются на мобильных.
    const [chatAction, setChatAction] = useState(null); // {type, chat}
    const [ttsMsgIdx, setTtsMsgIdx] = useState(null);       // индекс озвучиваемого сообщения
    const [feedback, setFeedback] = useState(null);          // { idx, type }
    const [feedbackMap, setFeedbackMap] = useState({});      // idx -> 'like'|'dislike'
    const [shareToast, setShareToast] = useState('');
    // Авто-скрытие теперь встроено в компонент <Toast>: он сам плавно
    // затухает через ~1.3с и по завершении затухания вызывает onFadeDone,
    // который здесь сбрасывает shareToast обратно в ''. Так родитель
    // избавлен от таймеров, а пользователь видит плавное появление И
    // плавное исчезновение (раньше пропадало резко).

    const voiceOpts = () => getVoiceOpts(state);

    // Кнопки композера (микрофон + отправка/голосовой режим) плавно
    // всплывают, когда голосовой режим только что закрылся — это вторая
    // половина перехода, первую (уплывание кнопок Voice Mode вниз)
    // проигрывает сам оверлей перед размонтированием.
    const composerBtnsRef = useRef(null);
    const prevVoiceActiveRef = useRef(!!voiceMode?.active);
    useGSAP(() => {
        const wasActive = prevVoiceActiveRef.current;
        prevVoiceActiveRef.current = !!voiceMode?.active;
        if (!wasActive || voiceMode?.active) return;
        const el = composerBtnsRef.current;
        if (!el) return;
        gsap.fromTo(el.children,
            { y: 18, scale: 0.72, autoAlpha: 0 },
            { y: 0, scale: 1, autoAlpha: 1, duration: 0.4, ease: 'back.out(1.8)', stagger: 0.07 });
    }, { dependencies: [voiceMode?.active] });

    // Кнопка Voice Mode: SVG-волна «оживает» при наведении — каждый бар
    // растёт от своего центра со сдвигом по времени от середины к краям,
    // как реально играющий эквалайзер, а не статичная иконка. Только для
    // настоящей мыши (hover: hover) — на тач-экране это не имеет смысла и
    // могло бы «залипнуть» после тапа.
    const voiceBtnRef = useRef(null);
    const voiceHoverTlRef = useRef(null);
    const onVoiceEnter = () => {
        const canHover = typeof window !== 'undefined' && window.matchMedia
            && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!canHover || prefersReducedMotion() || !voiceBtnRef.current) return;
        const bars = voiceBtnRef.current.querySelectorAll('svg path');
        if (!bars.length) return;
        voiceHoverTlRef.current?.kill();
        // Задача 4: раньше это был бесконечный yoyo-луп (repeat: -1) —
        // выглядело навязчиво, если курсор просто задержался на кнопке.
        // Теперь один короткий «вздох»: бары один раз подскакивают и сами
        // возвращаются (yoyo: true, repeat: 1 = туда-обратно и стоп).
        voiceHoverTlRef.current = gsap.timeline()
            .to(bars, { scaleY: 1.6, duration: 0.22, ease: 'sine.out', stagger: { each: 0.05, from: 'center' }, yoyo: true, repeat: 1 }, 0);
    };
    const onVoiceLeave = () => {
        voiceHoverTlRef.current?.kill();
        voiceHoverTlRef.current = null;
        const bars = voiceBtnRef.current?.querySelectorAll('svg path');
        if (bars?.length) gsap.to(bars, { scaleY: 1, duration: DUR.release, ease: EASE.out, overwrite: 'auto' });
    };
    useEffect(() => () => voiceHoverTlRef.current?.kill(), []);

    // Отклик поля ввода на фокус: очень сдержанный подъём + чуть более
    // выраженная тень. Это единственная анимация, которую пользователь
    // видит десятки раз за сессию, поэтому она намеренно на грани
    // заметности — движение на 2px, не «выезд». Задача — подтвердить, что
    // фокус пойман, а не устроить представление.
    useEffect(() => {
        const el = composerWrapRef.current;
        const ta = editableTextareaRef.current;
        if (!el || !ta) return undefined;
        if (prefersReducedMotion()) return undefined;
        const onFocus = () => gsap.to(el, { y: -2, duration: DUR.dropdown, ease: EASE.out, overwrite: 'auto' });
        const onBlur = () => gsap.to(el, { y: 0, duration: DUR.dropdown, ease: EASE.out, overwrite: 'auto' });
        ta.addEventListener('focus', onFocus);
        ta.addEventListener('blur', onBlur);
        return () => {
            ta.removeEventListener('focus', onFocus);
            ta.removeEventListener('blur', onBlur);
        };
    }, []);

    const speakMessage = (idx, text) => {
        // Голосовой режим открыт — читаем тем же голосом и через тот же
        // конвейер, что и сам разговор (иначе получилось бы два разных
        // проигрывателя одновременно).
        if (voiceMode?.active) { voiceMode.replay(text); return; }
        if (ttsMsgIdx === idx && tts.speaking) { tts.stop(); setTtsMsgIdx(null); return; }
        tts.stop();
        setTtsMsgIdx(idx);
        tts.speak(text, voiceOpts());
    };
    const closePlayer = () => { tts.stop(); setTtsMsgIdx(null); };

    const shareDialog = async () => {
        const chat = state.chatSessions.find(c => c.id === state.activeChatId) || state.chatSessions[0];
        const { url, tooLong } = buildShareLink(chat);
        try {
            if (!tooLong && navigator.share) { await navigator.share({ title: chat.title, url }); return; }
            if (!tooLong) { await navigator.clipboard.writeText(url); setShareToast('Ссылка на диалог скопирована'); }
            else { await navigator.clipboard.writeText(dialogToText(chat)); setShareToast('Диалог длинный — скопирован текстом'); }
        } catch {
            await navigator.clipboard.writeText(tooLong ? dialogToText(chat) : url);
            setShareToast('Скопировано');
        }
    };

    const submitFeedback = ({ type }) => {
        if (feedback) setFeedbackMap(m => ({ ...m, [feedback.idx]: type }));
    };

    // Обработчик действий из меню-троеточия в шапке чата (задача 11)
    // и из long-press меню на строке чата в истории (задача 12).
    // Работает с текущим activeChatId. Для действий, требующих ввод
    // (переименование), открывает prompt(); удаление подтверждается через
    // confirm(). Перемещение в проект временно показывает уведомление —
    // полноценный picker проектов — отдельная задача UI.
    const handleChatMenuAction = (action, chatId = null) => {
        const targetId = chatId || state.activeChatId;
        const chat = state.chatSessions.find(c => c.id === targetId);
        if (!chat) return;
        switch (action) {
            case 'share':
                shareDialog();
                break;
            case 'pin':
                updateState({
                    chatSessions: state.chatSessions.map(c =>
                        c.id === targetId ? { ...c, pinnedAt: c.pinnedAt ? null : Date.now() } : c
                    ),
                });
                setShareToast(chat.pinnedAt ? 'Чат откреплён' : 'Чат закреплён');
                break;
            case 'rename':
                setChatAction({ type: 'rename', chat });
                break;
            case 'moveToProj':
                setChatAction({ type: 'project', chat });
                break;
            case 'delete': {
                setChatAction({ type: 'delete', chat });
                break;
            }
            default:
                break;
        }
    };

    // Как только печать ответа завершилась — снимаем флаг isAnimated, чтобы под
    // сообщением появилась панель действий (копировать/поделиться/оценка/озвучка)
    const markAnimationDone = (idx) => {
        updateState({
            chatSessions: state.chatSessions.map(c => {
                if (c.id !== (activeChat?.id)) return c;
                return { ...c, messages: c.messages.map((m, i) => i === idx ? { ...m, isAnimated: false } : m) };
            }),
        });
    };

    // "Умный" автоскролл: пока идёт печать ответа, чат сам едет вниз вслед
    // за текстом — но как только пользователь прокрутил сам (например,
    // чтобы перечитать что-то выше), автоследование останавливается и не
    // мешает, пока пользователь сам не вернётся к низу переписки.
    const messagesContainerRef = useRef(null);
    const autoScrollRef = useRef(true);
    const [showScrollDown, setShowScrollDown] = useState(false);
    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            autoScrollRef.current = nearBottom;
            setShowScrollDown(!nearBottom);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        // Пересчитываем и при изменении размеров контейнера (например, когда
        // подгружаются изображения) — иначе кнопка «вниз» может не появиться
        // вовремя, если пользователь застрял в середине переписки.
        const ro = new ResizeObserver(onScroll);
        ro.observe(el);
        onScroll();
        return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
    }, []);
    const followScroll = () => {
        const el = messagesContainerRef.current;
        if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
    };
    // Принудительная прокрутка вниз по клику на плавающую кнопку — всегда
    // должна работать, даже если пользователь до этого прокрутил очень
    // далеко вверх. Делаем несколько повторных попыток, потому что во время
    // «печати» ответа контент ещё растёт — одиночный scrollTo не догонит
    // конец, и низ длинного ответа оставался недостижимым (баг долистывания).
    const scrollToBottomNow = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        autoScrollRef.current = true;
        setShowScrollDown(false);
        let tries = 0;
        const jump = () => {
            el.scrollTop = el.scrollHeight;
            tries += 1;
            if (tries < 12) requestAnimationFrame(jump);
        };
        jump();
    };
    // Новое сообщение — снова начинаем следить за низом переписки
    useEffect(() => { autoScrollRef.current = true; followScroll(); setShowScrollDown(false); }, [messages.length]);

    // Динамический нижний отступ контейнера сообщений = фактическая высота
    // плавающего инпут-бара + запас. Фиксированный pb-44 не спасал: реальная
    // высота бара меняется (превью картинки, многострочный ввод, режимы), и
    // низ длинного ответа мог прятаться под ним — отсюда баг «не долистать».
    const inputWrapRef = useRef(null);
    const [bottomPad, setBottomPad] = useState(120);
    useEffect(() => {
        const el = inputWrapRef.current;
        if (!el) return;
        const measure = () => setBottomPad(el.offsetHeight + 32);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Переход из поиска по истории — прокручиваем к конкретному сообщению
    // и на секунду подсвечиваем его, затем сбрасываем метку перехода.
    const [highlightMsgIdx, setHighlightMsgIdx] = useState(null);
    useEffect(() => {
        if (state.scrollToMessageIdx == null || state.scrollToMessageChatId !== activeChat?.id) return;
        const idx = state.scrollToMessageIdx;
        const timer = setTimeout(() => {
            const el = document.getElementById(`msg-${idx}`);
            if (el) {
                autoScrollRef.current = false;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightMsgIdx(idx);
                setTimeout(() => setHighlightMsgIdx(null), 2000);
            }
            updateState({ scrollToMessageIdx: null, scrollToMessageChatId: null });
        }, 150);
        return () => clearTimeout(timer);
    }, [state.scrollToMessageIdx, state.scrollToMessageChatId, activeChat?.id]);

    // Warning-баннер при 90%+ дневного лимита. Показывается над инпутом
    // до тех пор, пока пользователь не закроет его крестиком (тогда баннер
    // не появится снова до следующего сеанса — хранится в localStorage).
    const planLimits = getPlanLimits(state.userPlan);
    const dailyLimit = planLimits.daily;
    const dailyUsed = state.usedDailyLimits || 0;
    const dailyPercent = (dailyLimit === Infinity || dailyLimit === 'Infinity' || dailyLimit === 0)
        ? 0
        : Math.min(100, Math.round((dailyUsed / dailyLimit) * 100));
    const [warningDismissed, setWarningDismissed] = useState(() => {
        try { return localStorage.getItem('void_limit_warning_dismissed_at') === new Date().toISOString().slice(0, 10); } catch { return false; }
    });
    const showLimitWarning = dailyPercent >= 90 && dailyPercent < 100 && !warningDismissed;
    const dismissLimitWarning = () => {
        try { localStorage.setItem('void_limit_warning_dismissed_at', new Date().toISOString().slice(0, 10)); } catch {}
        setWarningDismissed(true);
    };

    // «Редактировать» из мини-меню long-press: кладём текст сообщения в
    // поле ввода (заменяя текущий черновик, если есть) и сразу фокусируем
    // textarea с курсором в конце — пользователь может сразу продолжить
    // печатать или отправить как новое сообщение. Мы намеренно НЕ трогаем
    // историю чата (не удаляем и не помечаем оригинал) — это простое и
    // предсказуемое поведение «скопировать текст в инпут для правки»,
    // а не полноценный edit-and-regenerate с обрезкой истории.
    // Раньше при «Редактировать» текст программно клался в state.inputValue,
    // но textarea не пересчитывала высоту — событие onChange (где висит
    // GSAP auto-resize) срабатывает только на РУЧНОЙ печати, не на
    // programmatic updateState(). Теперь после вставки текста вручную
    // считаем нужную высоту и анимируем её тем же способом, что и обычная
    // печать (GSAP, а не резкий скачок).
    const handleEditMessage = (idx, content) => {
        // Настоящее редактирование (задача 2): обрезаем историю чата ДО
        // этого сообщения включительно — старый ответ ИИ на него (и всё,
        // что шло дальше) исчезает. Раньше текст просто копировался в
        // поле ввода, а история не менялась вовсе: отправка добавляла
        // новую пару вопрос/ответ в КОНЕЦ чата, оставляя старую нетронутой.
        updateState({
            chatSessions: (state.chatSessions || []).map(s =>
                s.id === state.activeChatId ? { ...s, messages: s.messages.slice(0, idx) } : s
            ),
            inputValue: content,
        });
        requestAnimationFrame(() => {
            const el = editableTextareaRef.current;
            if (el) {
                el.focus();
                const len = content.length;
                try { el.setSelectionRange(len, len); } catch { /* noop */ }
                const prevH = el.offsetHeight;
                el.style.height = 'auto';
                const nextH = Math.min(el.scrollHeight, 220);
                el.style.height = prevH + 'px';
                gsap.to(el, { height: Math.max(nextH, 64), duration: 0.22, ease: 'power2.out', overwrite: true });
            }
        });
    };

    // Повторить (задача 2): та же логика обрезки, что и у редактирования,
    // но без ручного ввода — сразу переотправляем исходный текст вопроса.
    // updateState здесь и handleSendMessage ниже относятся к РАЗНЫМ
    // рендерам (React ещё не закоммитил обрезанную историю к моменту,
    // когда выполнялся бы обычный код после updateState), поэтому сама
    // отправка отложена до useEffect на retryQueued — тот срабатывает уже
    // после коммита, когда state.chatSessions в этом же рендере ChatView
    // гарантированно отражает обрезку (тот же паттерн, что и pendingHitl
    // в App.jsx).
    const [retryQueued, setRetryQueued] = useState(null);
    const retryMessage = (assistantIdx) => {
        const userIdx = assistantIdx - 1;
        const userMsg = messages[userIdx];
        if (!userMsg || userMsg.role !== 'user') return;
        updateState({
            chatSessions: (state.chatSessions || []).map(s =>
                s.id === state.activeChatId ? { ...s, messages: s.messages.slice(0, userIdx) } : s
            ),
            selectedImage: userMsg.image || null,
            selectedImages: userMsg.images || [],
        });
        setRetryQueued({ text: userMsg.content, key: Date.now() });
    };
    useEffect(() => {
        if (!retryQueued) return;
        setRetryQueued(null);
        handleSendMessage(retryQueued.text);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retryQueued]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-darkBg relative w-full max-w-full fade-in">
            <TopHeader state={state} updateState={updateState} onChatMenuAction={handleChatMenuAction} />
            
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth"
                style={{ paddingBottom: bottomPad }}
            >
                <div className="max-w-4xl mx-auto space-y-6">
                    {messages.length === 0 && (
                        <div className="text-center mt-20 fade-in">
                            <Icons.VoidLogo className="w-16 h-16 mx-auto mb-6 text-[#5b32d4] dark:text-purple-400 opacity-20" />
                            <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-600 mb-2">{t(lang, 'chat.startDialog')}</h2>
                            <p className="text-gray-400 dark:text-gray-600 text-sm">{t(lang, 'chat.sendMessage')}</p>
                        </div>
                    )}
                    
                    {messages.map((msg, idx) => (
                        <div key={idx} id={`msg-${idx}`} className={`flex gap-3 max-w-4xl transition-colors rounded-2xl min-w-0 ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''} ${highlightMsgIdx === idx ? 'void-search-highlight' : ''}`}>
                            {msg.role === 'user' ? (
                                <UserMessageBubble msg={msg} onCopied={setShareToast} onEdit={(content) => handleEditMessage(idx, content)} />
                            ) : (
                            <div className={`p-4 md:p-5 rounded-3xl void-selectable min-w-0 max-w-full overflow-hidden break-words bg-white dark:bg-darkBg text-gray-900 dark:text-gray-100 rounded-tl-sm`}>
                                {msg.image && <img src={msg.image} alt="Upload" className="max-w-full md:max-w-sm rounded-xl mb-3 shadow-sm border border-gray-100 dark:border-gray-800" />}
                                {msg.generatedImage ? (
                                    <div className="void-img-fadein">
                                        {/* Текст-описание сверху */}
                                        {msg.content && (
                                            <div className="mb-3">
                                                <MessageRenderer content={msg.content} />
                                            </div>
                                        )}
                                        {/* Крупный превью + иконка скачать в углу + long-press меню */}
                                        <GeneratedImage
                                            url={msg.generatedImage}
                                            prompt={msg.imagePrompt || msg.content}
                                            idx={idx}
                                            onEdit={(src) => setEditingImage({ src, source: 'generated', onSave: null })}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        {msg.role === 'assistant' && msg.reasoningTrace && msg.reasoningTrace.length > 0 && (
                                            <div className="mb-2.5">
                                                <button
                                                    onClick={() => setExpandedTraceIdx(expandedTraceIdx === idx ? null : idx)}
                                                    className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-400 transition-colors"
                                                >
                                                    <Icons.Sparkles className="w-3.5 h-3.5" />
                                                    {lang === 'en' ? 'Reasoning' : lang === 'zh' ? '推理过程' : 'Ход рассуждений'}
                                                    <Icons.ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedTraceIdx === idx ? 'rotate-180' : ''}`} />
                                                </button>
                                                {expandedTraceIdx === idx && (
                                                    <div className="mt-2 space-y-1.5 pl-1 fade-in">
                                                        {msg.reasoningTrace.map((step, sIdx) => {
                                                            const StepIcon = Icons[step.icon] || Icons.Sparkles;
                                                            return (
                                                                <div key={sIdx} className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                                                    <StepIcon className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
                                                                    <span>{step.text}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {msg.isAnimated ? <StreamingMessage content={msg.content} onProgress={followScroll} onDone={() => markAnimationDone(idx)} /> : <MessageRenderer content={msg.content} />}
                                        {msg.codeBlocks && msg.codeBlocks.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {msg.codeBlocks.map((block, bIdx) => (
                                                    <button key={bIdx} onClick={() => setActiveCodeBlock({ block, siblings: msg.codeBlocks })} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder hover:border-[#5b32d4] transition-colors text-left shadow-sm">
                                                        <div className="w-9 h-9 rounded-xl bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-400 flex items-center justify-center flex-shrink-0"><Icons.Code className="w-4 h-4" /></div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-sm dark:text-white truncate">{block.title}</p>
                                                            <p className="text-xs text-gray-400 uppercase font-semibold">{block.language} · открыть окно просмотра</p>
                                                        </div>
                                                        <Icons.ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                {/* Панель действий под ответом ИИ (копировать/поделиться/оценка/озвучка) */}
                                {msg.role === 'assistant' && !msg.isAnimated && !msg.generatedImage && msg.content && (
                                    <>
                                        <ChatToolbar
                                            text={msg.content}
                                            onShare={shareDialog}
                                            onFeedback={(type) => setFeedback({ idx, type })}
                                            onSpeak={() => speakMessage(idx, msg.content)}
                                            onRetry={() => retryMessage(idx)}
                                            speaking={ttsMsgIdx === idx && tts.speaking}
                                            speakLoading={ttsMsgIdx === idx && tts.loading}
                                            voiceStyle={!!voiceMode?.active}
                                            feedbackValue={feedbackMap[idx]}
                                        />
                                        {ttsMsgIdx === idx && tts.supported && (
                                            <AudioPlayer tts={tts} onClose={closePlayer} />
                                        )}
                                    </>
                                )}
                            </div>
                            )}
                        </div>
                    ))}
                    {state.isGenerating && state.isGeneratingImage && (
                        <ImageGenLoader lang={lang} />
                    )}
                    {state.isGenerating && !state.isGeneratingImage && (
                        <ThinkingIndicator lang={lang} level={currentReasoningLevel} />
                    )}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            {/* Плавающая кнопка «прокрутить вниз» — всегда доступна, если чат
                отскроллен от самого низа переписки (в т.ч. после ответа ИИ).
                Позиция считается от РЕАЛЬНОЙ высоты инпут-бара (bottomPad),
                поэтому при росте многострочного ввода стрелка плавно уходит
                выше и никогда не наезжает на поле. Фон полупрозрачный с
                backdrop-blur, чтобы кнопка не отвлекала внимание, но иконка
                стрелки — четкая на 100% (см. ScrollDownButton). */}
            <ScrollDownButton
                visible={showScrollDown}
                bottomPad={bottomPad}
                onClick={scrollToBottomNow}
                title={t(lang, 'chat.scrollToBottom')}
            />

            <div ref={inputWrapRef} className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white dark:from-darkBg via-white dark:via-darkBg to-transparent pt-14 px-3 sm:px-4 md:px-8 z-20 pointer-events-none pb-safe">
                <div className="relative max-w-4xl mx-auto pointer-events-auto">
                    {/* Warning-баннер: показывается когда дневной лимит чата
                        превышает 90%. Пользователь может закрыть крестиком —
                        тогда баннер не появится до следующего дня (сброс по
                        календарной дате в localStorage). */}
                    {showLimitWarning && (
                        <div className="flex items-center gap-2.5 mb-2.5 px-3.5 py-2.5 rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 fade-in">
                            <Icons.Alert className="w-4 h-4 shrink-0 text-orange-500" />
                            <p className="flex-1 text-xs font-semibold text-orange-700 dark:text-orange-300 leading-tight">
                                Использовано {dailyPercent}% дневного лимита. Скоро запросы закончатся —
                                <button
                                    onClick={() => updateState({ currentView: 'pricing' })}
                                    className="ml-1 underline hover:no-underline"
                                >сменить тариф</button>.
                            </p>
                            <button
                                onClick={dismissLimitWarning}
                                className="w-5 h-5 shrink-0 rounded-full hover:bg-orange-200/50 dark:hover:bg-orange-800/50 flex items-center justify-center text-orange-600 dark:text-orange-400 transition-colors"
                                title="Скрыть до завтра"
                            >
                                <Icons.X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    {/* Активный режим: генерация изображения или работа через агента.
                        Показываем иконку + подпись + крестик для отключения. */}
                    {(state.imageGenMode || state.activeAgentId) && (
                        <div className="flex items-center gap-2 mb-2.5 fade-in">
                            {state.imageGenMode && (
                                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-[#efecf9] dark:bg-purple-900/30 text-[#5b32d4] dark:text-purple-300 text-xs font-bold">
                                    <Icons.Image className="w-3.5 h-3.5" /> Режим изображения
                                    <button onClick={() => updateState({ imageGenMode: false })} className="ml-0.5 w-4 h-4 rounded-full bg-white/60 dark:bg-black/20 hover:bg-white flex items-center justify-center"><Icons.X className="w-2.5 h-2.5" /></button>
                                </span>
                            )}
                            {state.activeAgentId && (() => {
                                const ag = (state.aiAgents || []).find(a => a.id === state.activeAgentId);
                                if (!ag) return null;
                                return (
                                    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-bold" style={{ background: (ag.color || '#5b32d4') + '22', color: ag.color || '#5b32d4' }}>
                                        <Icons.Robot className="w-3.5 h-3.5" /> {ag.name}
                                        <button onClick={() => updateState({ activeAgentId: null })} className="ml-0.5 w-4 h-4 rounded-full bg-white/60 dark:bg-black/20 hover:bg-white flex items-center justify-center"><Icons.X className="w-2.5 h-2.5" /></button>
                                    </span>
                                );
                            })()}
                        </div>
                    )}
                    {(state.selectedImages && state.selectedImages.length > 0) && (
                        // Превью вложений: горизонтальная прокрутка, фото
                        // идут в ширину друг за другом (задача 8). Крестик
                        // в правом верхнем углу каждого превью удаляет его.
                        // Клик по самому превью открывает полноэкранный
                        // редактор (см. ImageEditorModal).
                        <div className="absolute -top-20 left-4 right-4 flex gap-2 overflow-x-auto pb-1 fade-in void-attach-scroll">
                            {state.selectedImages.map((img, i) => (
                                <div key={i} className="relative shrink-0 bg-white dark:bg-darkCard p-1 rounded-xl shadow-lg border border-gray-200 dark:border-darkBorder group">
                                    <img
                                        src={img}
                                        onClick={() => setEditingImage({ src: img, index: i, source: 'attachment' })}
                                        className="h-14 w-14 object-cover rounded-lg cursor-pointer"
                                        alt=""
                                    />
                                    <button
                                        onClick={() => updateState({ selectedImages: state.selectedImages.filter((_, idx) => idx !== i) })}
                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md"
                                    >
                                        <Icons.X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* В голосовом режиме поле ввода одно — то, что в
                        оверлее Voice Mode (сжатая полоса внизу). Свой
                        композер чата в это время не рисуем, иначе два поля
                        наслаивались бы друг на друга. */}
                    {/* Атрибут hidden здесь НЕ работал: у элемента классом
                        задан display:flex, а CSS перебивает hidden. Поэтому
                        композер чата в голосовом режиме именно НЕ
                        РЕНДЕРИТСЯ — поле ввода остаётся ровно одно (полоса
                        в оверлее Voice Mode). */}
                    <div
                        ref={composerWrapRef}
                        style={voiceMode?.active ? { display: 'none' } : undefined}
                        /* Спокойная серая рамка вместо фиолетового кольца и
                           тяжёлой тени: раньше focus-within:ring-4 + shadow-2xl
                           притягивали к себе всё внимание. min-h при развёрнутой
                           кнопке — чтобы верхняя кнопка «на весь экран» и нижний
                           ряд кнопок физически не могли наложиться друг на друга
                           (см. задачу 6). */
                        className={`flex flex-col bg-white dark:bg-darkCard rounded-[26px] border transition-colors relative ${state.imageGenMode ? 'border-[#5b32d4]/30 focus-within:border-[#5b32d4]/50' : 'border-gray-200 dark:border-darkBorder focus-within:border-gray-300 dark:focus-within:border-gray-600'}`}
                    >
                        {/* multiple — нативный мультивыбор из галереи: пользователь
                            отмечает галочками несколько фото за один заход системного
                            пикера (задача 2-4). Лимит по тарифу применяется в
                            addImageFiles ниже (3 фото Free / 9 на платных).
                            ПОПЫТКА №6: предыдущий комментарий утверждал, что
                            accept="image/*" убирает системное меню-разветвитель
                            («Медиатека / Сделать снимок / Выбрать файлы») на
                            iOS — по факту (см. скриншоты) это не так, меню
                            всё равно показывается. Переходим на явный список
                            MIME-типов без wildcard — по отчётам это чаще
                            приводит к прямому открытию галереи на WebKit.
                            Полной гарантии от самой iOS на это нет (см. итоговое
                            сообщение), но это самый близкий к нативному
                            поведению вариант, который можно настроить через HTML. */}
                        <input type="file" ref={chatFileInputRef} multiple accept="image/jpeg, image/png, image/webp, image/heic" className="hidden" onChange={(e) => {
                            addImageFiles(e.target.files);
                            e.target.value = '';
                        }} />
                        <input type="file" ref={cameraInputRef} accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                            addImageFiles(e.target.files);
                            e.target.value = '';
                        }} />
                        {/* Инпут для «Файлы» — намеренно исключает image/* из accept,
                            чтобы на мобильных браузер сразу открывал файловый
                            менеджер, а не то же окно «Медиатека/Файлы/Камера», что
                            и для «Фото» (когда accept допускает картинки, система
                            не может понять, что открыть по умолчанию). */}
                        <input type="file" ref={anyFileInputRef} multiple accept=".pdf,.doc,.docx,.txt,.csv,.json" className="hidden" onChange={(e) => {
                            addImageFiles(e.target.files);
                            e.target.value = '';
                        }} />
                        {/* ── Ряд 1: текстовое поле + всё, что накладывается
                            поверх него (запись, «преобразование в текст»,
                            кнопка «на весь экран») ── */}
                        <div className="relative">
                            {/* Задача 2: запись — БЕЗ фиолетовой заливки (нейтральный
                                полупрозрачный фон), пилюля с волной+таймером прижата
                                ВПРАВО, вплотную к кнопке-квадрату (стоп) в ряду ниже
                                — а не висит по центру во всю ширину. */}
                            {voice.recording && (
                                <div className="absolute inset-0 z-10 rounded-t-[26px] bg-white/80 dark:bg-darkCard/80 backdrop-blur-sm flex items-center justify-end pr-4 pointer-events-none fade-in">
                                    <RecordingPill voice={voice} />
                                </div>
                            )}
                            {/* Задача 2: «Преобразование в текст…» — по ЦЕНТРУ поля
                                (между выбором модели и микрофоном), нейтральным
                                серым, без фиолетового. */}
                            {voice.transcribing && !state.inputValue && (
                                <div className="void-transcribe-hint absolute inset-x-0 top-0 py-5 pointer-events-none text-gray-500 dark:text-gray-400 text-[16px] font-semibold text-center z-10">
                                    {t(lang, 'chat.transcribing')}…
                                </div>
                            )}
                            <textarea 
                                ref={editableTextareaRef}
                                className={`w-full px-5 pt-3.5 pb-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none overflow-y-auto max-h-[220px] min-h-[40px] text-[16px] void-input-scroll ${voice.recording ? 'void-text-hide' : ''} ${voice.transcribing && state.inputValue ? 'opacity-40' : ''}`}
                                placeholder={voice.busy ? '' : (state.imageGenMode ? t(lang, 'chat.imagePlaceholder') : t(lang, 'home.inputPlaceholder'))}
                                readOnly={voice.busy}
                                value={state.inputValue}
                                onChange={(e) => {
                                    updateState({inputValue: e.target.value});
                                    // Плавно анимируем высоту через GSAP: считаем target
                                    // с учётом max-h 220px, а gsap.to() создаёт мягкий
                                    // переход вместо резкого прыжка на каждое нажатие.
                                    const target = e.target;
                                    const prev = parseFloat(target.style.height || '0') || target.offsetHeight;
                                    target.style.height = 'auto';
                                    // Пустое поле обязано вернуться к исходной высоте:
                                    // scrollHeight у пустого textarea сохраняет прежний
                                    // размер вместе с padding, из-за чего после удаления
                                    // длинного текста поле оставалось раздутым.
                                    const nextH = e.target.value ? Math.min(target.scrollHeight, 220) : 0;
                                    target.style.height = prev + 'px';
                                    import('gsap').then(({ gsap }) => {
                                        if (!nextH) {
                                            // Возврат в исходное состояние: снимаем
                                            // инлайновую высоту, чтобы снова работал
                                            // min-h из классов.
                                            gsap.to(target, {
                                                height: 40, duration: 0.18, ease: 'power2.out', overwrite: true,
                                                onComplete: () => { target.style.height = ''; },
                                            });
                                            return;
                                        }
                                        gsap.to(target, { height: nextH, duration: 0.18, ease: 'power2.out', overwrite: true });
                                    });
                                }}
                                onKeyDown={(e) => { 
                                    // Задача 4: Enter больше НЕ отправляет сообщение — на
                                    // мобильной клавиатуре кнопка "отправить"/"ввод" должна
                                    // просто переносить строку (стандартное поведение
                                    // textarea, поэтому Enter здесь не перехватывается).
                                    // Отправка — только явным нажатием на кнопку-стрелку.
                                    if (e.key === 'Tab') { e.preventDefault(); composerInsertIndent(editableTextareaRef.current); }
                                }}
                                onFocus={(e) => {
                                    // На телефоне клавиатура может перекрыть поле ввода — после
                                    // её открытия (с небольшой задержкой на анимацию) подскролливаем
                                    // и само поле, и чат, чтобы переписка не пряталась за клавиатурой.
                                    setTimeout(() => {
                                        e.target.scrollIntoView({ behavior: 'smooth', block: 'end' });
                                        followScroll();
                                    }, 300);
                                }}
                                rows={1}
                            />
                            {/* Задача 2 (повторный раунд): кнопка полноэкранного
                                режима появляется только после 57 символов ИЛИ 3
                                вставленных отступов (см. useExpandableComposer) —
                                раньше срабатывало по высоте textarea, слишком
                                рано. */}
                            {composerManyChars && (
                                <button
                                    onClick={composerEnterFullscreen}
                                    title="Развернуть на весь экран"
                                    className="void-tap-target absolute z-30 top-2 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 transition-colors"
                                >
                                    <Icons.Maximize className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {/* ── Ряд 2: панель инструментов — «+», модель, затем
                            (справа) микрофон и отправка/Voice Mode. Задача 7:
                            селектор модели переехал сюда из шапки. Задача 8:
                            вся строка теперь обычный flex-ряд (как в референсе),
                            а не абсолютно спозиционированные поверх текста
                            кнопки. ── */}
                        <div ref={composerBtnsRef} className="flex items-center gap-2 px-3 pb-2.5">
                            {/* «+» слева: при записи переворачивается в «×» (отмена записи),
                                иначе открывает меню действий (проект/изображение/агенты/…) */}
                            <button
                                onClick={() => voice.recording ? voice.cancel() : setShowPlusMenu(true)}
                                {...pressProps(gsap)}
                                title={voice.recording ? t(lang, 'chat.cancelRecording') : undefined}
                                className="void-tap-target w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Icons.Plus className={`w-5 h-5 void-plus-rotate ${voice.recording ? 'void-plus-to-x' : ''}`} />
                            </button>

                            {/* Задача 7: выбор модели — прямо в поле ввода,
                                компактной pill-кнопкой (как «⚡ Быстрый» в
                                референсе), а не в шапке. */}
                            <ModelSelector state={state} updateState={updateState} compact />

                            <div className="flex-1" />

                            {voice.supported && (
                                <LiquidMicButton
                                    voice={voice}
                                    size="sm"
                                    onStart={startVoiceGuarded}
                                    title={t(lang, 'home.voiceInput')}
                                    stopTitle={t(lang, 'chat.stopRecording')}
                                />
                            )}
                            {/* Кнопка отправки/Voice Mode: пока поле ввода пустое (и нет
                                вложений) — показываем вход в разговорный Voice Mode
                                (значок волны на месте кнопки отправки, тот же фиолетовый,
                                что и раньше, без подписи — задача 8). Как только
                                появляется текст или фото — кнопка тут же становится
                                обычной стрелкой отправки. */}
                            {(state.inputValue.trim() || (state.selectedImages && state.selectedImages.length > 0)) ? (
                                <button
                                    onClick={() => state.imageGenMode ? handleGenerateImage() : handleSendMessage()}
                                    {...pressProps(gsap)}
                                    disabled={state.isGenerating || voice.busy}
                                    title="Отправить"
                                    className="void-tap-target w-9 h-9 shrink-0 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full flex items-center justify-center transition-colors"
                                ><Icons.ArrowUp className="w-4 h-4" /></button>
                            ) : state.imageGenMode ? (
                                // В режиме генерации изображений поле пустым быть не может —
                                // кнопка остаётся стрелкой (просто неактивной), Voice Mode
                                // здесь не предлагаем: это отдельный от диалога режим.
                                <button
                                    disabled
                                    title="Отправить"
                                    className="void-tap-target w-9 h-9 shrink-0 bg-gray-200 dark:bg-gray-800 text-gray-400 rounded-full flex items-center justify-center"
                                ><Icons.ArrowUp className="w-4 h-4" /></button>
                            ) : (
                                <button
                                    ref={voiceBtnRef}
                                    onClick={voiceMode.open}
                                    {...pressProps(gsap)}
                                    onMouseEnter={onVoiceEnter}
                                    onMouseLeave={onVoiceLeave}
                                    disabled={state.isGenerating || voice.busy}
                                    title="Voice Mode"
                                    className="void-voice-btn void-tap-target w-9 h-9 shrink-0 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full flex items-center justify-center transition-colors"
                                ><Icons.Waveform className="w-4 h-4" /></button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Задача 2 (повторный раунд) — полноэкранный режим ЧЕРЕЗ PORTAL
                прямо в document.body. Раньше пытались анимировать исходный
                элемент через position:fixed (GSAP FLIP), но он был вложен в
                предка с собственным position:absolute+z-index (см.
                inputWrapRef ниже) — это создаёт свой стекинговый контекст,
                и fixed-потомок всё равно рисовался ВНУТРИ него, из-за чего
                оверлей перекрывал содержимое («видно только блюр»). Portal
                полностью решает это — дерево рендерится в document.body,
                вне любых родительских z-index/position/transform. */}
            {composerExpanded && createPortal(
                <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-stretch justify-stretch fade-in">
                    {/* Задача 6: раньше на десктопе (sm: и выше) это окно
                        схлопывалось в маленькую центрированную карточку
                        (sm:h-auto sm:max-h-[85vh] sm:max-w-2xl) — «полноэкранный
                        ввод» на ПК был вовсе не полноэкранным. Теперь занимает
                        весь экран на любом брейкпоинте, как и задумано. */}
                    <div className="bg-white dark:bg-darkCard w-full h-full flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-darkBorder shrink-0">
                            <button
                                onClick={() => composerInsertIndent(expandedTextareaRef.current)}
                                title="Добавить отступ (красная строка)"
                                className="void-tap-target w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Icons.Indent className="w-5 h-5" />
                            </button>
                            <span className="text-sm font-bold text-gray-400">Полноэкранный ввод</span>
                            <button
                                onClick={() => {
                                    // Задача 3: если пользователь набрал длинный текст
                                    // ЦЕЛИКОМ в полноэкранном режиме и просто свернул
                                    // его (не отправляя), компактное поле ни разу не
                                    // получало onChange — его инлайн-высота так и
                                    // оставалась на минимуме (64px), и кнопка
                                    // полноэкранного режима (сверху) наслаивалась на
                                    // кнопку отправки (снизу). Пересчитываем высоту
                                    // компактного textarea сразу после сворачивания.
                                    composerExitFullscreen();
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
                            value={state.inputValue}
                            onChange={(e) => updateState({ inputValue: e.target.value })}
                            // Задача 4: Enter в полноэкранном режиме тоже просто
                            // переносит строку (стандартное поведение textarea) —
                            // раньше он ошибочно вставлял отступ (4 неразрывных
                            // пробела) вместо переноса, из-за чего на мобильной
                            // клавиатуре при нажатии "Enter"/"Ввод" появлялся
                            // один большой пробел. Tab по-прежнему вставляет отступ.
                            enterKeyHint="enter"
                            onKeyDown={(e) => {
                                if (e.key === 'Tab') {
                                    e.preventDefault();
                                    composerInsertIndent(expandedTextareaRef.current);
                                }
                            }}
                            placeholder={voice.busy ? '' : (state.imageGenMode ? t(lang, 'chat.imagePlaceholder') : t(lang, 'home.inputPlaceholder'))}
                            className="flex-1 w-full p-4 sm:p-6 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none resize-none text-[16px] leading-7"
                        />
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-darkBorder shrink-0">
                            {voice.supported && (
                                <LiquidMicButton
                                    voice={voice}
                                    size="lg"
                                    bordered
                                    onStart={startVoiceGuarded}
                                    title={t(lang, 'home.voiceInput')}
                                    stopTitle={t(lang, 'chat.stopRecording')}
                                />
                            )}
                            <button
                                onClick={() => { (state.imageGenMode ? handleGenerateImage() : handleSendMessage()); composerExitFullscreen(); }}
                                disabled={(!state.inputValue.trim() && !(state.selectedImages && state.selectedImages.length > 0)) || state.isGenerating || voice.busy}
                                title="Отправить"
                                className="void-tap-target w-11 h-11 bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-full border-2 border-white/30 disabled:border-transparent flex items-center justify-center transition-all shadow-md"
                            >
                                <Icons.ArrowUp className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {chatAction?.type === 'rename' && (
                <RenameChatModal
                    chat={chatAction.chat}
                    onClose={() => setChatAction(null)}
                    onSave={(title) => updateState({
                        chatSessions: state.chatSessions.map(c => c.id === chatAction.chat.id ? { ...c, title } : c),
                    })}
                />
            )}
            {chatAction?.type === 'delete' && (
                <DeleteChatModal
                    chat={chatAction.chat}
                    onClose={() => setChatAction(null)}
                    onConfirm={() => {
                        const remaining = state.chatSessions.filter(c => c.id !== chatAction.chat.id);
                        updateState({
                            chatSessions: remaining,
                            activeChatId: remaining[0]?.id || null,
                            currentView: remaining.length === 0 ? 'home' : state.currentView,
                        });
                    }}
                />
            )}
            {chatAction?.type === 'project' && (
                <AddToProjectModal
                    chat={chatAction.chat}
                    projects={state.projects || []}
                    onClose={() => setChatAction(null)}
                    onPick={(projectId) => updateState({
                        chatSessions: state.chatSessions.map(c => c.id === chatAction.chat.id ? { ...c, projectId } : c),
                    })}
                    onCreate={(name, description) => {
                        const id = 'proj' + Date.now();
                        updateState({
                            projects: [{ id, name, description: description || '', createdAt: Date.now() }, ...(state.projects || [])],
                            chatSessions: state.chatSessions.map(c => c.id === chatAction.chat.id ? { ...c, projectId: id } : c),
                        });
                    }}
                />
            )}
            {activeCodeBlock && <CodeViewerModal block={activeCodeBlock.block} siblings={activeCodeBlock.siblings} onClose={() => setActiveCodeBlock(null)} />}
            {showPlusMenu && (
                <ChatPlusMenu
                    state={state}
                    updateState={updateState}
                    onClose={() => setShowPlusMenu(false)}
                    onPickCamera={() => openFilePicker(cameraInputRef)}
                    onPickPhoto={() => openFilePicker(chatFileInputRef)}
                    onPickFile={() => openFilePicker(anyFileInputRef)}
                    onEnableImage={() => updateState({ imageGenMode: true, activeAgentId: null })}
                    onPickAgent={(agent) => updateState({ activeAgentId: agent.id, imageGenMode: false })}
                    onOpenAddToProject={() => {
                        // Тот же путь, что и «⋮» → «Добавить в проект» в шапке
                        // чата/истории (handleChatMenuAction → 'moveToProj'),
                        // чтобы это было ровно одно и то же окно, а не две
                        // разные реализации одного и того же действия.
                        setShowPlusMenu(false);
                        handleChatMenuAction('moveToProj');
                    }}
                />
            )}
            {editingImage && (
                <ImageEditorModal
                    image={editingImage}
                    onClose={() => setEditingImage(null)}
                    onApply={(newSrc) => {
                        if (editingImage.source === 'attachment') {
                            const next = [...(state.selectedImages || [])];
                            next[editingImage.index] = newSrc;
                            updateState({ selectedImages: next });
                        } else if (editingImage.source === 'generated' && editingImage.onSave) {
                            editingImage.onSave(newSrc);
                        }
                        setEditingImage(null);
                    }}
                />
            )}
            {feedback && (
                <FeedbackModal type={feedback.type} onSubmit={submitFeedback} onClose={() => setFeedback(null)} />
            )}
            {shareToast && (
                <Toast message={shareToast} onFadeDone={() => setShareToast('')} />
            )}
        </div>
    );
}
