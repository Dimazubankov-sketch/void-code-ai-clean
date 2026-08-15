import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { VoiceModeOrb } from '@/features/chat/VoiceModeOrb';
import { VOICE_MODE_PHASE } from '@/shared/lib/useVoiceMode';
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

export function VoiceModeOverlay({ state, updateState, voiceMode, onClose, onSendText }) {
    const {
        phase, muted, errorMsg, primaryTap, toggleMute, analyserRef,
        speechAudioRef, speechEnvelopeRef, videoSource, startVideo,
    } = voiceMode;
    const [showVoiceSettings, setShowVoiceSettings] = useState(false);
    const [showMediaMenu, setShowMediaMenu] = useState(false);
    // Свёрнутый режим: фон уходит, орб опускается к полю ввода, и под
    // оверлеем становится виден обычный чат — переписка разговора там же,
    // где и всегда, дублировать её отдельным списком незачем.
    const [minimized, setMinimized] = useState(false);

    const orbWrapRef = useRef(null);
    const backdropRef = useRef(null);
    const mediaMenuRef = useRef(null);
    const previewRef = useRef(null);
    const stripRef = useRef(null);
    const composerRef = useRef(null);
    const sideBtnsRef = useRef(null);

    // ---- Появление полосы ввода при ВХОДЕ в голосовой режим ----
    // Поле «сжимается влево» (растёт из уменьшенной ширины), а кнопки
    // микрофона и выхода всплывают снизу. Обратный переход при закрытии
    // проигрывается в handleClose ниже — там он должен успеть доиграть
    // ДО размонтирования оверлея, иначе анимации просто не видно.
    useGSAP(() => {
        const composer = composerRef.current;
        const btns = sideBtnsRef.current;
        if (!composer || !btns) return;
        gsap.fromTo(composer,
            { scaleX: 1.06, transformOrigin: 'left center', autoAlpha: 0 },
            { scaleX: 1, autoAlpha: 1, duration: 0.4, ease: 'power3.out' });
        gsap.fromTo(btns.children,
            { y: 26, scale: 0.7, autoAlpha: 0 },
            { y: 0, scale: 1, autoAlpha: 1, duration: 0.42, ease: 'back.out(1.7)', stagger: 0.07, delay: 0.06 });
    }, { scope: stripRef });

    // Закрытие с анимацией: кнопки уплывают вниз, поле растягивается
    // вправо — и только после этого режим действительно закрывается, и
    // на его месте появляется обычный композер чата со своими кнопками.
    const handleClose = () => {
        const composer = composerRef.current;
        const btns = sideBtnsRef.current;
        if (!composer || !btns) { onClose(); return; }
        const tl = gsap.timeline({ onComplete: onClose });
        tl.to(btns.children, { y: 24, scale: 0.7, autoAlpha: 0, duration: 0.22, ease: 'power2.in', stagger: 0.05 }, 0)
          .to(composer, { scaleX: 1.07, transformOrigin: 'left center', duration: 0.3, ease: 'power2.out' }, 0.1)
          .to(stripRef.current, { autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, 0.18);
    };

    // Подключаем тот же MediaStream, что уже захвачен хуком, ко второму
    // <video> — для показа пользователю. Отдельный поток не запрашиваем:
    // это второе разрешение браузера и лишняя нагрузка.
    useEffect(() => {
        const el = previewRef.current;
        const stream = voiceMode.videoStream;
        if (!el) return;
        if (stream && !minimized) {
            el.srcObject = stream;
            el.play?.().catch(() => { /* автоплей может отклониться — не критично */ });
        } else {
            el.srcObject = null;
        }
    }, [voiceMode.videoStream, videoSource, minimized]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Включили камеру — орб сразу уходит вниз, чтобы не перекрывать кадр
    // (то же положение, что и при ручном сворачивании тапом по орбу).
    useEffect(() => {
        if (videoSource === 'camera') setMinimized(true);
    }, [videoSource]);

    // ---- Анимация сворачивания/разворачивания ----
    // Фон гаснет, орб уезжает вниз и уменьшается до размера, при котором
    // он аккуратно стоит над полосой ввода. Обратно — тем же путём.
    useGSAP(() => {
        const orb = orbWrapRef.current;
        const backdrop = backdropRef.current;
        if (!orb || !backdrop) return;
        if (minimized) {
            gsap.to(backdrop, { autoAlpha: 0, duration: 0.35, ease: 'power2.out' });
            gsap.to(orb, { scale: 0.34, y: () => window.innerHeight * 0.34, duration: 0.55, ease: 'power3.inOut' });
        } else {
            gsap.to(backdrop, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' });
            gsap.to(orb, { scale: 1, y: 0, duration: 0.55, ease: 'power3.inOut' });
        }
    }, { dependencies: [minimized] });

    // Всплывающее меню камеры/экрана над кнопкой.
    useGSAP(() => {
        const el = mediaMenuRef.current;
        if (!el) return;
        if (showMediaMenu) {
            gsap.fromTo(el, { autoAlpha: 0, y: 10, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.24, ease: 'back.out(1.8)' });
        } else {
            gsap.to(el, { autoAlpha: 0, y: 8, scale: 0.96, duration: 0.16, ease: 'power2.in' });
        }
    }, { dependencies: [showMediaMenu] });

    const isLimited = phase === VOICE_MODE_PHASE.LIMIT;
    const displayPhase = isLimited ? VOICE_MODE_PHASE.LIMIT : (muted ? VOICE_MODE_PHASE.IDLE : phase);
    const statusText = isLimited
        ? PHASE_LABELS[VOICE_MODE_PHASE.LIMIT]
        : muted
            ? 'Микрофон отключён'
            : (phase === VOICE_MODE_PHASE.ERROR && errorMsg ? errorMsg : PHASE_LABELS[phase]);

    const chooseMedia = (source) => { setShowMediaMenu(false); startVideo(source); };

    return createPortal(
        // pointer-events-none на корне в свёрнутом состоянии — чтобы клики
        // проходили в чат под оверлеем; сами наши элементы возвращают себе
        // pointer-events-auto.
        <div className={`fixed inset-0 z-[220] flex flex-col ${minimized ? 'pointer-events-none' : ''}`}>
            <div ref={backdropRef} className="absolute inset-0 bg-white dark:bg-gradient-to-b dark:from-[#1a1030] dark:to-[#0d0819]">
                {/* Живое превью. Для КАМЕРЫ — на весь экран. Для ЭКРАНА
                    полноэкранного превью быть не должно: мы показываем на
                    весь экран то, что и так является этим же экраном, —
                    получается бесконечное зеркало («троение», из-за
                    которого интерфейс выглядел размноженным). Поэтому для
                    демонстрации — небольшое окошко в углу, где рекурсия
                    безобидна и наглядно видно, что именно передаётся. */}
                {videoSource === 'camera' && (
                    <>
                        <video
                            ref={previewRef}
                            autoPlay muted playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/45" />
                    </>
                )}
            </div>

            {/* Голосовые настройки — в правом верхнем углу, ровно там же,
                где в хабе и в чате стоит кнопка меню (fixed top-5 right-4).
                Самой кнопки меню здесь нет: в разговоре она не нужна, а
                занимала единственное удобное место. */}
            <div className={`fixed top-5 right-4 sm:top-6 sm:right-6 z-30 pointer-events-auto ${minimized ? 'opacity-0 pointer-events-none' : ''}`}>
                <PressIconButton
                    onClick={() => setShowVoiceSettings(true)}
                    title="Голосовые настройки"
                    className="void-tap-target p-2.5 bg-white/90 dark:bg-darkCard/90 backdrop-blur-lg rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-darkBorder"
                >
                    <Icons.Sliders className="w-6 h-6" />
                </PressIconButton>
            </div>

            {/* Орб. В свёрнутом виде уезжает вниз и остаётся кликабельным —
                повторный тап разворачивает режим обратно. */}
            {/* Индикатор передачи видео. Показывается и на телефоне, и на
                десктопе, в том числе в свёрнутом режиме — иначе непонятно,
                что камера/экран всё ещё передаются ИИ. */}
            {videoSource && (
                <div className={`relative z-20 flex justify-center pointer-events-none ${minimized ? 'pt-3' : ''}`}>
                    <span className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/65 text-white text-xs font-bold backdrop-blur-sm shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        {videoSource === 'screen' ? 'Демонстрация экрана' : 'Камера включена'}
                    </span>
                </div>
            )}

            {/* Небольшое окно демонстрации экрана — вместо полноэкранного,
                см. комментарий выше про зеркальную рекурсию. */}
            {videoSource === 'screen' && !minimized && (
                <div className="absolute top-20 left-4 sm:left-6 z-20 w-40 sm:w-56 rounded-2xl overflow-hidden border border-white/25 shadow-2xl pointer-events-none">
                    <video ref={previewRef} autoPlay muted playsInline className="w-full aspect-video object-cover bg-black" />
                </div>
            )}

            <div className="relative flex-1 flex flex-col items-center justify-center gap-8 pointer-events-none">
                <div ref={orbWrapRef} className="pointer-events-auto">
                    <VoiceModeOrb
                        phase={displayPhase}
                        analyserRef={analyserRef}
                        speechAudioRef={speechAudioRef}
                        speechEnvelopeRef={speechEnvelopeRef}
                        onClick={isLimited ? undefined : () => setMinimized((v) => !v)}
                        size={200}
                    />
                </div>
                <p className={`text-base font-semibold min-h-[1.5em] text-center max-w-xs transition-opacity ${minimized ? 'opacity-0' : ''} ${isLimited ? 'text-red-500' : 'text-gray-700 dark:text-white/80'}`}>
                    {statusText}
                </p>
            </div>

            {/* Нижняя полоса: сжатое поле ввода слева + камера, микрофон и
                выход справа. В голосовом режиме поле не исчезает, а именно
                сжимается — можно и говорить, и дописать текстом. */}
            {/* В свёрнутом режиме полоса ввода нужна только в чате: на
                других экранах (настройки, тарифы, почта) она перекрывала бы
                их собственный интерфейс. Орб при этом остаётся плавать
                поверх всего — разговор можно вести, гуляя по приложению. */}
            <div
                ref={stripRef}
                className={`relative w-full px-4 pb-6 sm:pb-8 pointer-events-auto ${minimized && state.currentView !== 'chat' ? 'hidden' : ''}`}
            >
                <div className="max-w-3xl mx-auto flex items-center gap-2.5">
                    <div ref={composerRef} className="vm-composer flex-1 min-w-0 flex items-center gap-2 bg-white dark:bg-darkCard rounded-full border border-gray-200 dark:border-darkBorder px-3 py-2.5">
                        <div className="relative shrink-0">
                            <PressIconButton
                                onClick={() => setShowMediaMenu((v) => !v)}
                                title="Камера или экран"
                                className={`void-tap-target w-8 h-8 rounded-full flex items-center justify-center transition-colors ${videoSource ? 'bg-[#5b32d4] text-white' : 'text-[#5b32d4] hover:bg-[#5b32d4]/10'}`}
                            >
                                <Icons.Plus className="w-5 h-5" />
                            </PressIconButton>
                            <div
                                ref={mediaMenuRef}
                                style={{ opacity: 0, visibility: 'hidden' }}
                                className="absolute bottom-11 left-0 w-52 bg-white dark:bg-[#150d28] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 p-1.5 z-10"
                            >
                                <PressIconButton onClick={() => chooseMedia('camera')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                                    <Icons.Camera className="w-4 h-4 text-[#5b32d4] shrink-0" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{videoSource === 'camera' ? 'Выключить камеру' : 'Камера'}</span>
                                </PressIconButton>
                                <PressIconButton onClick={() => chooseMedia('screen')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                                    <Icons.Monitor className="w-4 h-4 text-[#5b32d4] shrink-0" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{videoSource === 'screen' ? 'Отключить экран' : 'Поделиться экраном'}</span>
                                </PressIconButton>
                            </div>
                        </div>
                        {/* Переключение фронтальной/основной камеры —
                            появляется только когда камера включена. */}
                        {videoSource === 'camera' && (
                            <PressIconButton
                                onClick={() => voiceMode.flipCamera?.()}
                                title="Сменить камеру"
                                className="void-tap-target w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[#5b32d4] hover:bg-[#5b32d4]/10 transition-colors"
                            >
                                <Icons.Refresh className="w-4 h-4" />
                            </PressIconButton>
                        )}
                        <input
                            value={state.inputValue}
                            onChange={(e) => updateState({ inputValue: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && state.inputValue.trim()) {
                                    e.preventDefault();
                                    onSendText?.(state.inputValue.trim());
                                }
                            }}
                            placeholder={videoSource ? (videoSource === 'screen' ? 'Вижу твой экран…' : 'Вижу камеру…') : 'Спросить Void Code'}
                            className="flex-1 min-w-0 bg-transparent text-[15px] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                        />
                    </div>

                    <div ref={sideBtnsRef} className="flex items-center gap-2.5 shrink-0">
                    <PressIconButton
                        onClick={toggleMute}
                        title={muted ? 'Включить микрофон' : 'Отключить микрофон'}
                        className={`void-tap-target w-12 h-12 shrink-0 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20'}`}
                    >
                        {muted ? <Icons.MicOff className="w-5 h-5" /> : <Icons.Mic className="w-5 h-5" />}
                    </PressIconButton>
                    <PressIconButton
                        onClick={handleClose}
                        title="Завершить Voice Mode"
                        className="void-tap-target w-12 h-12 shrink-0 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center transition-colors"
                    >
                        <Icons.X className="w-5 h-5" />
                    </PressIconButton>
                    </div>
                </div>
            </div>

            {showVoiceSettings && (
                <VoiceModeSettings state={state} updateState={updateState} onClose={() => setShowVoiceSettings(false)} />
            )}

            {isLimited && <LimitModal onClose={onClose} />}
        </div>,
        document.body,
    );
}
