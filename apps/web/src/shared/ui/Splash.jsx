import { useState, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ЗАСТАВКА (SPLASH) — на GSAP
// ==========================================
// Хореография собрана в единый GSAP-таймлайн (gsap-timeline skill):
//  1) логотип «влетает» из глубины — scale + rotation + снятие блюра,
//     затем мягко пружинит (back.out);
//  2) вокруг разгорается ореол-свечение;
//  3) название появляется словами с каскадом (stagger);
//  4) тонкая линия прогресса заполняется, после чего вся сцена уводится.
// Пока логотип на сцене — он чуть «дышит» и парит (бесконечный yoyo).
// Уход (leave) — тоже через таймлайн. Анимируются только transform/opacity/
// filter (GPU-композитинг, 60fps). prefers-reduced-motion уважается.
export function Splash({ onDone, dark }) {
    const scope = useRef(null);
    const [leaving, setLeaving] = useState(false);
    const finishedRef = useRef(false);
    const floatRef = useRef(null);

    const leave = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setLeaving(true);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { setTimeout(onDone, 200); return; }
        floatRef.current?.kill();
        gsap.timeline({ onComplete: onDone })
            .to('.vc-splash__stage', { scale: 1.06, autoAlpha: 0, filter: 'blur(6px)', duration: 0.5, ease: 'power2.in' });
    };

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            gsap.set('.vc-splash__logo, .vc-splash__word, .vc-splash__halo', { autoAlpha: 1 });
            const t = setTimeout(leave, 1400);
            return () => clearTimeout(t);
        }

        const tl = gsap.timeline();
        tl.from('.vc-splash__logo', {
                scale: 0.3, autoAlpha: 0, rotation: -90, filter: 'blur(14px)',
                duration: 1.0, ease: 'back.out(1.7)',
            })
            .from('.vc-splash__halo', {
                scale: 0.4, autoAlpha: 0, duration: 0.9, ease: 'power2.out',
            }, '-=0.7')
            .from('.vc-splash__word', {
                y: 26, autoAlpha: 0, duration: 0.5, stagger: 0.12, ease: 'power3.out',
            }, '-=0.5')
            .fromTo('.vc-splash__progress > span',
                { scaleX: 0 },
                { scaleX: 1, transformOrigin: 'left center', duration: 1.0, ease: 'power1.inOut' },
                '-=0.3')
            .add(() => { leave(); }, '+=0.2');

        // Лёгкое «дыхание» + парение логотипа, пока сцена на экране
        floatRef.current = gsap.to('.vc-splash__logo', {
            y: -8, scale: 1.03, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.0,
        });
        // Пульс ореола
        gsap.to('.vc-splash__halo', {
            scale: 1.12, autoAlpha: 0.85, duration: 2.0, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.0,
        });

        const safety = setTimeout(leave, 4000);
        return () => { clearTimeout(safety); floatRef.current?.kill(); };
    }, { scope });

    return (
        <div
            ref={scope}
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
