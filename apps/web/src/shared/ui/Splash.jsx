import { useState, useEffect, useRef } from 'react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ЗАСТАВКА (SPLASH) — профессиональная версия
// ==========================================
// Принципы:
// • Анимируются только transform / opacity / filter — это композитинг на GPU,
//   поэтому заставка идёт ровно в 60fps даже на слабых телефонах.
// • Хореография в три такта: логотип «проявляется» из лёгкого блюра →
//   название поднимается словами с каскадом → тонкая линия прогресса
//   заполняется и заставка мягко растворяется.
// • Уход со сцены — отдельная фаза (leave), а не резкое исчезновение:
//   клик «пропустить» тоже проходит через плавный выход.
// • prefers-reduced-motion уважается на уровне CSS (простой фейд).
export function Splash({ onDone, dark }) {
    const [leaving, setLeaving] = useState(false);
    const finishedRef = useRef(false);

    const leave = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setLeaving(true);
        // Длительность совпадает с CSS-переходом .vc-splash--leave
        setTimeout(onDone, 520);
    };

    useEffect(() => {
        const t = setTimeout(leave, 2300);
        return () => clearTimeout(t);
    }, []);

    return (
        <div
            className={`vc-splash ${dark ? 'vc-splash--dark' : 'vc-splash--light'} ${leaving ? 'vc-splash--leave' : ''}`}
            onClick={leave}
            role="presentation"
            title="Нажмите, чтобы пропустить"
        >
            <div className="vc-splash__stage">
                <div className="vc-splash__halo" aria-hidden="true" />
                <Icons.VoidLogo className="vc-splash__logo" />
                <div className="vc-splash__brand">
                    <span className="vc-splash__word void-grad-text">VOID</span>
                    <span className="vc-splash__word vc-splash__word--2">CODE</span>
                    <span className="vc-splash__word vc-splash__word--3">AI</span>
                </div>
                <div className="vc-splash__progress" aria-hidden="true"><span /></div>
            </div>
            <div className="vc-splash__skip">нажмите, чтобы пропустить</div>
        </div>
    );
}
