import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { EASE, DUR, prefersReducedMotion } from '@/shared/lib/motion';

// ==========================================
// PressButton — общий эффект нажатия через GSAP
// ==========================================
// Отклик живёт на НАЖАТИИ (pointerdown), а не на отпускании: как только
// появляется задержка между касанием и реакцией, ощущение прямого
// управления рассыпается. Ждать click/pointerup — значит выглядеть мёртвым.
//
// Глубина нажатия намеренно небольшая (0.96, не 0.94): кнопка должна
// «поддаться» под пальцем, а не проваливаться. Возврат — с едва заметным
// овершутом, чтобы движение читалось как физическое, а не как линейный
// откат. При reduced-motion не масштабируем вообще.
export function PressButton({ onClick, className, title, disabled, children, as: As = 'button' }) {
    const ref = useRef(null);
    const pressRef = useRef(() => {});
    const releaseRef = useRef(() => {});

    useGSAP((context, contextSafe) => {
        const reduce = prefersReducedMotion();
        pressRef.current = contextSafe(() => {
            if (disabled || reduce) return;
            gsap.to(ref.current, { scale: 0.96, duration: DUR.press, ease: EASE.out, overwrite: 'auto' });
        });
        releaseRef.current = contextSafe(() => {
            if (reduce) return;
            gsap.to(ref.current, { scale: 1, duration: DUR.release, ease: EASE.press, overwrite: 'auto' });
        });
    }, { scope: ref });

    return (
        <As
            ref={ref}
            onClick={onClick}
            title={title}
            disabled={disabled}
            onPointerDown={() => pressRef.current()}
            onPointerUp={() => releaseRef.current()}
            onPointerLeave={() => releaseRef.current()}
            className={className}
            style={{ willChange: 'transform' }}
        >
            {children}
        </As>
    );
}
