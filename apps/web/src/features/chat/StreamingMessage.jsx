import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { MessageRenderer } from '@/features/chat/MessageRenderer';

// ==========================================
// StreamingMessage — «печать» ответа ИИ (задача 12)
// ==========================================
// Требование: ответ должен ПОЯВЛЯТЬСЯ красивой анимацией печати, но БЕЗ
// классического бага «сырой текст → резкая подмена на форматированный»
// (стиль прыгал в конце печати). Решение:
//   • Сразу рендерим ФИНАЛЬНЫЙ форматированный markdown (MessageRenderer) —
//     жирный остаётся жирным, таблицы таблицами, стиль неизменен.
//   • Поверх уже готового DOM «проявляем» слова по очереди (opacity+лёгкий
//     подъём) через GSAP — это и есть эффект печати, но без переформата.
//   • Код, таблицы и виджеты НЕ разбиваем на слова — они появляются сразу
//     (дробить моноширинный код по словам выглядело бы шумно).
//   • Мигающая каретка в конце — знак «идёт печать», убирается по завершении.
//   • Очень длинные ответы и prefers-reduced-motion — одно мягкое
//     проявление всего блока (fade+blur), без пословной анимации.
//
// onDone дёргается по завершении: ChatView гасит isAnimated и рендерит
// обычный MessageRenderer — представление ИДЕНТИЧНО, подмена незаметна.

const MAX_WORDS_FOR_TYPEWRITER = 420; // выше — слишком тяжело и долго
const TARGET_TOTAL_MS = 1600;         // желаемая длительность печати
const MAX_STAGGER = 0.05;             // не медленнее этого на слово (короткие ответы)

export function StreamingMessage({ content, onProgress, onDone }) {
    const [shown, setShown] = useState(false);
    const wrapRef = useRef(null);
    const doneRef = useRef(onDone);
    const progressRef = useRef(onProgress);
    doneRef.current = onDone;
    progressRef.current = onProgress;
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return undefined;
        ranRef.current = true;
        const el = wrapRef.current;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const finishSimple = () => {
            setShown(true);
            progressRef.current?.();
            const done = setTimeout(() => doneRef.current?.(), 60);
            return () => clearTimeout(done);
        };

        if (reduce || !el) return finishSimple();

        // Собираем текстовые узлы, НЕ трогая код/таблицы/виджеты.
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                if (node.parentElement && node.parentElement.closest('pre, code, table, .void-no-typewriter')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        // Оценка количества слов — если ответ огромный, не дробим.
        const approxWords = textNodes.reduce((sum, n) => sum + (n.textContent.trim().split(/\s+/).length), 0);
        if (approxWords === 0 || approxWords > MAX_WORDS_FOR_TYPEWRITER) {
            // Плавное проявление всего блока (fade+blur) — как запасной вариант.
            setShown(true);
            gsap.fromTo(el, { autoAlpha: 0.001, filter: 'blur(6px)' }, {
                autoAlpha: 1, filter: 'blur(0px)', duration: 0.32, ease: 'power2.out',
                onUpdate: () => progressRef.current?.(),
                onComplete: () => doneRef.current?.(),
            });
            return undefined;
        }

        // Оборачиваем каждое слово в span (пробелы оставляем как есть).
        const spans = [];
        textNodes.forEach((node) => {
            const frag = document.createDocumentFragment();
            const parts = node.textContent.split(/(\s+)/);
            parts.forEach((p) => {
                if (p === '') return;
                if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
                const s = document.createElement('span');
                s.textContent = p;
                s.style.opacity = '0';
                s.style.display = 'inline-block';
                s.style.willChange = 'opacity, transform';
                frag.appendChild(s);
                spans.push(s);
            });
            node.parentNode.replaceChild(frag, node);
        });

        setShown(true);
        if (spans.length === 0) return finishSimple();

        // Каретка в конце — мигает, пока идёт печать.
        const caret = document.createElement('span');
        caret.className = 'void-type-caret';
        el.appendChild(caret);

        const stagger = Math.min(MAX_STAGGER, TARGET_TOTAL_MS / 1000 / spans.length);
        let lastProgress = 0;
        const tween = gsap.to(spans, {
            opacity: 1,
            y: 0,
            duration: 0.24,
            ease: 'power1.out',
            stagger,
            startAt: { y: 2 },
            onUpdate: () => {
                const now = Date.now();
                if (now - lastProgress > 90) { lastProgress = now; progressRef.current?.(); }
            },
            onComplete: () => {
                caret.remove();
                progressRef.current?.();
                doneRef.current?.();
            },
        });

        return () => { tween.kill(); caret.remove(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div ref={wrapRef} className={`t-stream-in ${shown ? 'is-in' : ''}`}>
            <MessageRenderer content={content} />
        </div>
    );
}
