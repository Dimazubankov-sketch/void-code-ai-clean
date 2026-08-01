import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { MessageRenderer } from '@/features/chat/MessageRenderer';

// ==========================================
// TypewriterMessage — плавная «печать» ответа ИИ
// ==========================================
// Вместо резких setInterval-рывков прогресс печати гоним через GSAP-твин
// (gsap-core): анимируем число 0→1 с ease "power2.out", а onUpdate
// отрисовывает соответствующую часть текста. За счёт сглаживания начало
// идёт живо, а концовка мягко замедляется — печать выглядит естественнее.
// Твин чистится в cleanup (kill), онопрогресс дергает автоскролл чата.

export function TypewriterMessage({ content, onProgress, onDone }) {
    const [disp, setDisp] = useState('');
    const proxyRef = useRef({ v: 0 });

    useEffect(() => {
        const text = content || '';
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce || text.length === 0) {
            setDisp(text);
            if (onDone) onDone();
            return;
        }

        // Длительность подстраивается под длину: короткие реплики печатаются
        // заметно, длинные не тянутся дольше ~2.2с.
        const duration = Math.min(2.2, Math.max(0.45, text.length * 0.009));
        proxyRef.current.v = 0;
        setDisp('');

        const tween = gsap.to(proxyRef.current, {
            v: 1,
            duration,
            ease: 'power2.out',
            onUpdate: () => {
                const chars = Math.round(proxyRef.current.v * text.length);
                setDisp(text.slice(0, chars));
                if (onProgress) onProgress();
            },
            onComplete: () => {
                setDisp(text);
                if (onDone) onDone();
            },
        });
        return () => tween.kill();
    }, [content]);

    return <MessageRenderer content={disp} />;
}
