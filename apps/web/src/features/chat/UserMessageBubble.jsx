import { useRef, useState, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useLongPressMenu } from '@/shared/lib/useLongPressMenu';
import { MessageActionMenu } from '@/features/chat/MessageActionMenu';
import { copyToCb } from '@/shared/lib/clipboard';
import { Icons } from '@/shared/ui/Icons';

// Порог сворачивания длинных сообщений (задача 2): если натуральная высота
// текста превышает это значение (px) — сообщение сворачивается, показывая
// только верхнюю часть с градиентным затуханием снизу и кнопкой-стрелкой
// для разворачивания. ~7 строк текста при 17-18px шрифте.
const COLLAPSE_HEIGHT = 190;

// ==========================================
// UserMessageBubble — пузырь СВОЕГО (user) сообщения
// ==========================================
// Выделен в отдельный компонент, чтобы у каждого экземпляра был свой
// useLongPressMenu (React hooks нельзя вызывать в .map()).
//
// Зажатие (long-press, >450мс) открывает плавающее мини-меню из двух
// действий — «Скопировать» и «Редактировать» — вместо прежнего мгновенного
// копирования. Меню появляется с GSAP-анимацией (см. MessageActionMenu).
//
// Фото теперь рендерятся ОТДЕЛЬНО от текстового пузыря, над ним — а не
// внутри как раньше. Если фото идёт вместе с текстом — миниатюры мелкие
// (в ряд помещается 3-4), если фото без текста — заметно крупнее (это
// теперь «фото-сообщение», а не вложение к тексту). При нескольких фото,
// не помещающихся в ряд — горизонтальная лента со свайпом на мобильных
// и стрелками-кнопками на ПК (см. UserImageStrip ниже).
//
// onEdit получает текст сообщения и кладёт его в поле ввода чата (родитель
// — ChatView — отвечает за то, куда именно положить текст: обычно в
// state.inputValue с фокусом на textarea).
export function UserMessageBubble({ msg, onCopied, onEdit }) {
    const { bind, menuOpen, setMenuOpen } = useLongPressMenu();
    const images = msg.images && msg.images.length > 0 ? msg.images : (msg.image ? [msg.image] : []);
    const hasText = !!(msg.content && msg.content.trim());

    const handleCopy = () => {
        try { copyToCb(msg.content || ''); } catch { /* noop */ }
        if (onCopied) onCopied('Скопировано');
        setMenuOpen(false);
    };

    const handleEdit = () => {
        if (onEdit) onEdit(msg.content || '');
        setMenuOpen(false);
    };

    return (
        <div className="relative flex flex-col items-end gap-2 max-w-full">
            <MessageActionMenu
                open={menuOpen}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onClose={() => setMenuOpen(false)}
            />

            {images.length > 0 && <UserImageStrip images={images} large={!hasText} />}

            {hasText && (
                <CollapsibleUserText bind={bind} content={msg.content} />
            )}
        </div>
    );
}

// ==========================================
// CollapsibleUserText — текстовый пузырь с автосворачиванием (задача 2)
// ==========================================
// Полный текст всегда лежит в DOM (contentRef) — ничего не обрезается на
// уровне данных, обрезка чисто визуальная через maxHeight на wrapperRef.
// После монтирования/смены текста меряем реальную высоту контента: если
// она больше COLLAPSE_HEIGHT — считаем сообщение «длинным», ставим
// wrapper в свёрнутое состояние (maxHeight: COLLAPSE_HEIGHT) и показываем
// градиентную «дымку» снизу + кнопку-стрелку в правом нижнем углу пузыря.
// Клик по стрелке — GSAP-твин maxHeight между COLLAPSE_HEIGHT и полной
// scrollHeight (ease power2.inOut), стрелка синхронно вращается на 180°.
// При разворачивании по завершении твина снимаем инлайновый maxHeight
// (clearProps), чтобы контент корректно реагировал на ресайз окна/шрифта;
// при сворачивании обратно — снова фиксируем px-значение перед стартом.
function CollapsibleUserText({ bind, content }) {
    const wrapperRef = useRef(null);
    const contentRef = useRef(null);
    const arrowRef = useRef(null);
    const fadeRef = useRef(null);
    const [isLong, setIsLong] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Измеряем один раз при монтировании/смене текста — является ли
    // сообщение длинным. Пересчёт при ресайзе не нужен: сообщения в
    // истории чата не меняют ширину контейнера динамически после отправки.
    useLayoutEffect(() => {
        const contentEl = contentRef.current;
        const wrapperEl = wrapperRef.current;
        if (!contentEl || !wrapperEl) return;
        const full = contentEl.scrollHeight;
        const long = full > COLLAPSE_HEIGHT + 24; // небольшой запас, чтобы не сворачивать сообщения «впритык»
        setIsLong(long);
        if (long) {
            gsap.set(wrapperEl, { height: COLLAPSE_HEIGHT });
        } else {
            gsap.set(wrapperEl, { height: 'auto' });
        }
        setExpanded(false);
    }, [content]);

    const { contextSafe } = useGSAP({ scope: wrapperRef });

    const toggle = contextSafe(() => {
        const wrapperEl = wrapperRef.current;
        const contentEl = contentRef.current;
        const arrowEl = arrowRef.current;
        if (!wrapperEl || !contentEl) return;
        const nextExpanded = !expanded;
        const targetHeight = nextExpanded ? contentEl.scrollHeight : COLLAPSE_HEIGHT;

        gsap.to(wrapperEl, {
            height: targetHeight,
            duration: 0.4,
            ease: 'power2.inOut',
            onComplete: () => {
                // Разворот полностью завершён — снимаем фиксированную высоту,
                // чтобы контент дальше вёл себя как обычный блок (auto).
                if (nextExpanded && wrapperRef.current) {
                    gsap.set(wrapperRef.current, { height: 'auto' });
                }
            },
        });
        if (arrowEl) {
            gsap.to(arrowEl, { rotation: nextExpanded ? 180 : 0, duration: 0.4, ease: 'power2.inOut' });
        }
        if (fadeRef.current) {
            gsap.to(fadeRef.current, { autoAlpha: nextExpanded ? 0 : 1, duration: 0.3, ease: 'power2.out' });
        }
        setExpanded(nextExpanded);
    });

    // Задача 2 (найден реальный баг): bind содержит СВОЙ ref-колбэк
    // (targetRef из useLongPressMenu — нужен, чтобы pulse-анимация при
    // long-press применялась именно к этому DOM-узлу). Но этому же узлу
    // нужен и wrapperRef (для GSAP-анимации разворачивания текста). JSX
    // не умеет объединять два ref на одном элементе сам — при
    // {...bind} ref={wrapperRef} второй ref молча перезаписывает первый,
    // и pulse-анимация целится в null. Разбираем bind на ref отдельно и
    // остальные обработчики отдельно, дальше объединяем оба ref вручную
    // в одном колбэке.
    const { ref: longPressRef, ...longPressHandlers } = bind;
    const setWrapperNode = (node) => {
        wrapperRef.current = node;
        if (typeof longPressRef === 'function') longPressRef(node);
    };

    return (
        <div className="relative max-w-full">
            <div
                {...longPressHandlers}
                ref={setWrapperNode}
                // Специально БЕЗ void-selectable: пользователь попросил
                // убрать ручное выделение и копирование СВОИХ сообщений —
                // теперь единственный способ скопировать текст своего
                // сообщения это open-меню и кнопка «Скопировать». user-select-none
                // отключает системное выделение (на desktop и iOS long-press
                // тоже перестанет вызывать системное меню Copy). Сообщения
                // ИИ по-прежнему остаются выделяемыми — их отдельный
                // рендер в MessageRenderer.
                className="p-4 md:p-5 rounded-3xl min-w-0 max-w-full overflow-hidden break-words bg-[#5b32d4] text-white rounded-tr-sm shadow-sm cursor-pointer select-none touch-manipulation"
                style={{ willChange: 'transform, height', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
            >
                <div ref={contentRef} className={`text-[17px] sm:text-[18px] leading-relaxed break-words whitespace-pre-wrap ${isLong ? 'pb-6' : ''}`}>
                    {content}
                </div>
            </div>

            {isLong && (
                <>
                    {/* Градиентная дымка снизу — сигнал, что текст обрезан.
                        Цвет совпадает с фоном пузыря (#5b32d4), скрывается
                        полностью при развороте. */}
                    <div
                        ref={fadeRef}
                        className="pointer-events-none absolute left-0 right-0 bottom-0 h-12 rounded-b-3xl"
                        style={{ background: 'linear-gradient(to bottom, rgba(91,50,212,0), rgba(91,50,212,1))' }}
                    />
                    <button
                        onClick={toggle}
                        title={expanded ? 'Свернуть' : 'Развернуть сообщение'}
                        className="void-tap-target absolute right-2.5 bottom-2 z-10 w-7 h-7 flex items-center justify-center text-white focus:outline-none focus-visible:outline-none"
                    >
                        <span ref={arrowRef} className="flex items-center justify-center">
                            <Icons.ChevronDown className="w-4 h-4" />
                        </span>
                    </button>
                </>
            )}
        </div>
    );
}

// ==========================================
// UserImageStrip — фото над пузырём (одно / лента с несколькими)
// ==========================================
// large=true (фото без текста) — крупнее; при этом ОДНО фото без текста
// показывается как самостоятельное «фото-сообщение», без ленты.
// large=false (фото + текст) — компактные миниатюры, 3-4 в ряд.
// При переполнении — overflow-x-auto (свайп на тач-устройствах) + GSAP-
// анимированные стрелки-кнопки, которые проявляются при наведении (ПК).
function UserImageStrip({ images, large }) {
    const scrollRef = useRef(null);
    const arrowsRef = useRef(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(images.length > 1);
    const [hovering, setHovering] = useState(false);

    const updateArrows = () => {
        const el = scrollRef.current;
        if (!el) return;
        setCanLeft(el.scrollLeft > 4);
        setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };

    // Стрелки проявляются/скрываются мягким GSAP-фейдом при наведении —
    // никаких резких CSS-переключений, но и без лишней анимационной
    // избыточности (простой fade, 0.2с).
    useGSAP(() => {
        if (!arrowsRef.current) return;
        gsap.to(arrowsRef.current.querySelectorAll('.void-img-arrow'), {
            autoAlpha: hovering ? 1 : 0,
            duration: 0.2,
            ease: 'power2.out',
        });
    }, { dependencies: [hovering, canLeft, canRight] });

    const scrollByPage = (dir) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
    };

    // Одно фото без сопроводительного текста — крупное самостоятельное
    // «фото-сообщение», лента здесь не нужна.
    if (large && images.length === 1) {
        return (
            <img
                src={images[0]}
                alt="Фото"
                className="max-w-[260px] sm:max-w-[300px] max-h-[320px] w-full object-cover rounded-[1.75rem] shadow-sm border border-gray-100 dark:border-gray-800"
            />
        );
    }

    const size = large ? 'w-36 h-36 sm:w-44 sm:h-44' : 'w-20 h-20 sm:w-24 sm:h-24';

    return (
        <div
            className="relative max-w-full"
            onMouseEnter={() => { updateArrows(); setHovering(true); }}
            onMouseLeave={() => setHovering(false)}
        >
            <div
                ref={scrollRef}
                onScroll={updateArrows}
                className="flex gap-2 overflow-x-auto scrollbar-hide max-w-full scroll-smooth"
                style={{ scrollSnapType: 'x proximity' }}
            >
                {images.map((src, i) => (
                    <img
                        key={i}
                        src={src}
                        alt=""
                        className={`${size} shrink-0 object-cover rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800`}
                        style={{ scrollSnapAlign: 'start' }}
                    />
                ))}
            </div>
            <div ref={arrowsRef}>
                {canLeft && (
                    <button
                        onClick={() => scrollByPage(-1)}
                        className="void-img-arrow hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 dark:bg-darkCard/95 shadow-md items-center justify-center text-gray-600 dark:text-gray-300"
                        style={{ opacity: 0 }}
                    >
                        <Icons.ChevronLeft className="w-4 h-4" />
                    </button>
                )}
                {canRight && (
                    <button
                        onClick={() => scrollByPage(1)}
                        className="void-img-arrow hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 dark:bg-darkCard/95 shadow-md items-center justify-center text-gray-600 dark:text-gray-300"
                        style={{ opacity: 0 }}
                    >
                        <Icons.ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
