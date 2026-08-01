import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// ==========================================
// Переиспользуемые GSAP-хелперы входных анимаций
// ==========================================
// Единый «почерк» появления по всему Void Code, построенный на GSAP
// (gsap-core skill): аккуратный ease, лёгкий подъём/масштаб, поддержка
// prefers-reduced-motion (движение отключается, но контент виден).
// Все хуки создают анимации внутри useGSAP() со scope → очистка на
// размонтировании автоматическая (gsap-react skill).

const prefersReduced = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Плавное появление одного элемента (модалка, карточка) с подъёмом.
export function useEnter(deps = []) {
    const ref = useRef(null);
    useGSAP(() => {
        if (!ref.current || prefersReduced()) return;
        gsap.from(ref.current, { autoAlpha: 0, y: 16, duration: 0.4, ease: 'power3.out' });
    }, { dependencies: deps });
    return ref;
}

// Появление с лёгким «поп»-масштабом (для диалогов/поповеров).
export function usePop(deps = []) {
    const ref = useRef(null);
    useGSAP(() => {
        if (!ref.current || prefersReduced()) return;
        gsap.from(ref.current, { autoAlpha: 0, scale: 0.94, y: 10, duration: 0.45, ease: 'back.out(1.6)' });
    }, { dependencies: deps });
    return ref;
}

// Каскадное появление списка: элементы всплывают со стаггером.
// Передайте scope-ref на контейнер и селектор дочерних элементов.
export function useStaggerIn(childSelector = '.stagger-item', deps = []) {
    const scope = useRef(null);
    useGSAP(() => {
        if (!scope.current || prefersReduced()) return;
        const items = gsap.utils.toArray(childSelector, scope.current);
        if (!items.length) return;
        gsap.from(items, { autoAlpha: 0, y: 14, duration: 0.4, ease: 'power2.out', stagger: 0.05 });
    }, { scope, dependencies: deps });
    return scope;
}
