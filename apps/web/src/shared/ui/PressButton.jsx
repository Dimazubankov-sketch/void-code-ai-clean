import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// PressButton — общий эффект нажатия через GSAP
// ==========================================
// Один и тот же паттерн раньше был размножен по нескольким файлам
// (VoiceModeSettings, VoiceModeOverlay) копипастой. Вынесен сюда, чтобы
// выбор модели и уровня рассуждений в шапке чата (и любое другое место)
// получали одинаковый, по-настоящему GSAP-шный отклик на нажатие, а не
// CSS active:scale.
export function PressButton({ onClick, className, title, disabled, children, as: As = 'button' }) {
    const ref = useRef(null);
    const pressRef = useRef(() => {});
    const releaseRef = useRef(() => {});

    useGSAP((context, contextSafe) => {
        pressRef.current = contextSafe(() => {
            if (disabled) return;
            gsap.to(ref.current, { scale: 0.94, duration: 0.09, ease: 'power2.out', overwrite: 'auto' });
        });
        releaseRef.current = contextSafe(() => {
            gsap.to(ref.current, { scale: 1, duration: 0.28, ease: 'back.out(2.4)', overwrite: 'auto' });
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
