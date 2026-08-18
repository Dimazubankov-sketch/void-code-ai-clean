import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';
import { PAYWALL_CARD_LIGHT, PAYWALL_CARD_DARK } from './paywallAssets';

// ==========================================
// LimitExceededModal — окно «Лимит исчерпан» (paywall)
// ==========================================
// Единый переиспользуемый paywall для всех услуг (чат / код / голос /
// картинки). Управляется полностью из App-state:
//   • state.paywall = { context } — что показать (или null/пусто = скрыто)
//   • updateState({ paywall: null }) — закрыть
//
// Сценарий показа ровно как в ТЗ:
//   1) сначала короткий тост «Ваш лимит исчерпан» (≈1 с),
//   2) затем всплывает сама карточка (scale 0.95→1 + fade, backdrop blur+dim).
//
// Карточка — присланная заказчиком картинка «Разблокируйте весь потенциал
// AI» с вырезанным фоном: тёмный вариант для тёмной темы, светлый — для
// светлой. Поверх картинки только крестик и кнопки; текст уже нарисован
// на самой карточке, поэтому не дублируем его версткой (карточка — это и
// есть контент модалки, как и просили).

export function LimitExceededModal({ state, updateState }) {
    const paywall = state.paywall;
    const isDark = !!state.isDarkMode;

    // Фазы: 'toast' (первая ≈1 с) → 'modal' (карточка). Отдельный локальный
    // стейт, а не в App — чтобы переход тост→модалка не гонял глобальный
    // ререндер всего приложения каждую фазу.
    const [phase, setPhase] = useState('toast');

    const overlayRef = useRef(null);
    const cardRef = useRef(null);
    const toastRef = useRef(null);
    const closeBtnRef = useRef(null);
    const goBtnRef = useRef(null);
    // Куда вернуть фокус после закрытия (доступность).
    const prevFocusRef = useRef(null);

    // При каждом новом показе начинаем с фазы тоста. Полная карточка
    // (фаза 'modal') показывается ТОЛЬКО платящим... точнее наоборот —
    // только БЕСПЛАТНЫМ пользователям, у которых реально есть смысл
    // предлагать платный тариф. Пользователь на Pro/Ultra, упёршийся в
    // дневной лимит, видит просто тост «Ваш лимит исчерпан» — ему
    // предлагать перейти на платный тариф уже не нужно, он там и есть.
    // Исключение — явный запрос командой @plan (context: 'plan'): это
    // осознанный клик человека, который сам захотел посмотреть тарифы,
    // а не реактивное всплытие при исчерпании лимита, поэтому карточка
    // показывается всегда, независимо от тарифа.
    useEffect(() => {
        if (!paywall) return;
        setPhase('toast');
        prevFocusRef.current = document.activeElement;
        const isFreeUser = (state.userPlan || 'free') === 'free';
        const showFullCard = paywall.context === 'plan' || isFreeUser;
        const t = setTimeout(() => {
            if (showFullCard) setPhase('modal');
            else updateState({ paywall: null });
        }, 1000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paywall]);

    const handleClose = () => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const done = () => {
            updateState({ paywall: null });
            // Возвращаем фокус туда, где он был до открытия окна.
            try { prevFocusRef.current?.focus?.(); } catch { /* noop */ }
        };
        if (reduce || !cardRef.current) { done(); return; }
        gsap.to(cardRef.current, { autoAlpha: 0, scale: 0.96, duration: 0.2, ease: 'power2.in' });
        gsap.to(overlayRef.current, { autoAlpha: 0, duration: 0.22, ease: 'power2.in', onComplete: done });
    };

    const handleGoToPlans = () => {
        // CTA ведёт в уже существующий flow выбора тарифа — не хардкодим
        // оплату, просто открываем вкладку «Тарифы».
        updateState({ paywall: null, currentView: 'pricing' });
    };

    // Анимации появления. Тост — быстрый fade/slide сверху; карточка —
    // scale+fade вместе с backdrop. GSAP чистится автоматически (useGSAP).
    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (phase === 'toast' && toastRef.current) {
            if (reduce) { gsap.set(toastRef.current, { autoAlpha: 1, y: 0 }); return; }
            gsap.fromTo(toastRef.current,
                { autoAlpha: 0, y: -16 },
                { autoAlpha: 1, y: 0, duration: 0.32, ease: 'power3.out' });
        }
        if (phase === 'modal' && overlayRef.current && cardRef.current) {
            // Фокус на крестик — точка входа focus-trap.
            closeBtnRef.current?.focus?.();
            if (reduce) {
                gsap.set(overlayRef.current, { autoAlpha: 1 });
                gsap.set(cardRef.current, { autoAlpha: 1, scale: 1 });
                return;
            }
            gsap.fromTo(overlayRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.28, ease: 'power2.out' });
            gsap.fromTo(cardRef.current,
                { autoAlpha: 0, scale: 0.95, y: 8 },
                { autoAlpha: 1, scale: 1, y: 0, duration: 0.42, ease: 'back.out(1.5)' });
        }
    }, { dependencies: [phase] });

    // Кнопки внутри карточки — лёгкий press feedback (scale) через GSAP.
    const press = (el) => { if (el) gsap.to(el, { scale: 0.94, duration: 0.12, ease: 'power2.out' }); };
    const release = (el) => { if (el) gsap.to(el, { scale: 1, duration: 0.18, ease: 'power2.out' }); };

    // ESC закрывает, Tab держим внутри модалки (focus trap).
    useEffect(() => {
        if (phase !== 'modal') return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); handleClose(); return; }
            if (e.key === 'Tab') {
                const focusables = [closeBtnRef.current, goBtnRef.current].filter(Boolean);
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    if (!paywall) return null;

    const cardSrc = isDark ? PAYWALL_CARD_DARK : PAYWALL_CARD_LIGHT;

    // Фаза тоста: только короткая надпись сверху по центру, без backdrop.
    if (phase === 'toast') {
        return (
            <div className="fixed inset-0 z-[80] pointer-events-none flex items-start justify-center">
                <div
                    ref={toastRef}
                    role="status"
                    aria-live="polite"
                    className="mt-6 px-5 py-3 rounded-2xl bg-gray-900/90 dark:bg-black/80 text-white text-sm font-bold shadow-2xl backdrop-blur-md flex items-center gap-2.5"
                >
                    <Icons.Alert className="w-5 h-5 text-amber-400 shrink-0" style={{ width: 20, height: 20, minWidth: 20 }} />
                    Ваш лимит исчерпан
                </div>
            </div>
        );
    }

    // Фаза модалки.
    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md px-4 pb-6 sm:pb-4"
            onMouseDown={(e) => { if (e.target === overlayRef.current) handleClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Лимит исчерпан"
        >
            <div ref={cardRef} className="relative w-full max-w-md sm:max-w-lg">
                {/* Крестик — правый верхний угол модалки */}
                <button
                    ref={closeBtnRef}
                    onClick={handleClose}
                    aria-label="Закрыть окно"
                    className="absolute -top-3 -right-1 sm:-top-4 sm:-right-4 z-10 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-md transition-colors"
                >
                    <Icons.X className="w-5 h-5" />
                </button>

                {/* Карточка (картинка заказчика, фон вырезан) + CTA прямо
                    поверх баннера — компактно, без отдельной большой кнопки
                    под изображением, как и просили. */}
                <div className="relative">
                    <img
                        src={cardSrc}
                        alt="Разблокируйте весь потенциал AI"
                        draggable={false}
                        className="w-full h-auto rounded-[1.75rem] shadow-2xl select-none"
                    />
                    <button
                        ref={goBtnRef}
                        onClick={handleGoToPlans}
                        onMouseDown={(e) => press(e.currentTarget)}
                        onMouseUp={(e) => release(e.currentTarget)}
                        onMouseLeave={(e) => release(e.currentTarget)}
                        onTouchStart={(e) => press(e.currentTarget)}
                        onTouchEnd={(e) => release(e.currentTarget)}
                        className="absolute left-4 bottom-4 sm:left-5 sm:bottom-5 px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl bg-white text-gray-900 font-extrabold text-sm sm:text-base shadow-xl hover:bg-gray-100 transition-colors"
                    >
                        Перейти
                    </button>
                </div>
            </div>
        </div>
    );
}
