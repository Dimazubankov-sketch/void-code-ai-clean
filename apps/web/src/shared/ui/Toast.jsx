import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

// ==========================================
// Toast — плавающий тост с fade-in / hold / fade-out
// ==========================================
// Показывает переданное сообщение и сам организует свою жизнь: плавно
// появляется, держится ~holdMs миллисекунд, потом плавно затухает и
// снимается с DOM. Раньше в чате тост «Скопировано» показывался через
// {shareToast && <div>...</div>} — исчезновение было мгновенным
// (React просто убирал ноду из дерева), появление красивое, а
// исчезновение резкое, пользователю это не понравилось.
//
// Здесь мы разделяем «пропс `message`» и «внутреннее состояние visible»:
// - когда родитель передаёт непустой message, тост монтируется и
//   начинает fade-in;
// - через holdMs (по умолчанию 900мс) стартует fade-out;
// - после завершения fade-out родителю сообщается onFadeDone(), чтобы
//   он мог обнулить сам message (иначе React будет держать тост в дереве
//   вечно, потому что message непустой);
// - если во время hold/fade-out родитель прислал НОВЫЙ message,
//   таймеры сбрасываются, и цикл начинается сначала.

const HOLD_MS = 900;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 380;

export function Toast({ message, onFadeDone }) {
    const ref = useRef(null);
    // Локальный кэш текста — чтобы во время fade-out показывать именно
    // тот текст, который затухает, даже если родитель уже обнулил message.
    const [displayText, setDisplayText] = useState('');

    useEffect(() => {
        if (!message) return;
        const el = ref.current;
        if (!el) return;

        setDisplayText(message);

        // Останавливаем предыдущие твины на этой ноде (например, если
        // тост был в середине затухания, а пришёл новый message).
        gsap.killTweensOf(el);

        // Fade-in
        gsap.fromTo(
            el,
            { autoAlpha: 0, y: 8, scale: 0.96 },
            { autoAlpha: 1, y: 0, scale: 1, duration: FADE_IN_MS / 1000, ease: 'power2.out' }
        );

        // Hold → fade-out
        const holdTimer = setTimeout(() => {
            gsap.to(el, {
                autoAlpha: 0,
                y: -6,
                scale: 0.98,
                duration: FADE_OUT_MS / 1000,
                ease: 'power2.in',
                onComplete: () => {
                    if (onFadeDone) onFadeDone();
                },
            });
        }, HOLD_MS);

        return () => {
            clearTimeout(holdTimer);
            gsap.killTweensOf(el);
        };
    }, [message, onFadeDone]);

    // Если message пустой и мы никогда не показывали текст — не рендерим
    // вовсе. Иначе render'им с последним показанным текстом (даже когда
    // родитель уже обнулил message) — это нужно, чтобы fade-out анимация
    // успевала доиграть на ЧЁМ-ТО, а не на пустой строке.
    if (!message && !displayText) return null;

    return (
        <div
            ref={ref}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold shadow-xl pointer-events-none"
            style={{ willChange: 'transform, opacity' }}
        >
            {displayText}
        </div>
    );
}
