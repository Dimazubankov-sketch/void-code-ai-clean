import { useState, useEffect, useRef } from 'react';
import { MessageRenderer } from '@/features/chat/MessageRenderer';

// ==========================================
// StreamingMessage — появление ответа ИИ (задача 6, переработка)
// ==========================================
// Что было не так (регресс прошлого раунда): текст сначала «печатался»
// словами как ПЛОСКИЙ текст (без markdown), а по завершении компонент
// РЕЗКО подменялся на MessageRenderer с полным форматированием. Из-за
// этого:
//   • стиль текста заметно «прыгал» в конце (сырой текст → жирный/
//     заголовки/списки) — то самое «через 3 секунды весь текст и другой
//     стиль»;
//   • это классический «brick wall» переход, против которого прямо
//     предупреждает skill review-animations (резкая подмена одного
//     представления другим вместо плавного моста).
//
// Как сделано теперь (по review-animations + apple-design):
//   • Ответ в чате — частое, инициируемое клавиатурой действие. По
//     принципу «frequency-appropriate» такие вещи должны иметь МИНИМУМ
//     движения. Поэтому никакой пословной печати больше нет.
//   • Сразу рендерим ФИНАЛЬНый форматированный markdown (MessageRenderer),
//     один раз, без последующей подмены — стиль неизменен от первого
//     кадра до последнего, прыжка быть не может в принципе.
//   • Единственное движение — одно короткое мягкое проявление всего блока
//     (opacity + micro-blur), меньше 300мс, ease-out. Blur «сглаживает»
//     появление (приём «blur to mask» из гайда), а не печатает по буквам.
//   • prefers-reduced-motion — без движения вообще.
//
// onDone дёргаем сразу в том же кадре: ChatView гасит isAnimated и дальше
// сам рендерит MessageRenderer — представление ИДЕНТИЧНО тому, что здесь,
// поэтому подмена снаружи больше не даёт никакого визуального скачка.
export function StreamingMessage({ content, onProgress, onDone }) {
    const [shown, setShown] = useState(false);
    const wrapRef = useRef(null);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;

    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            setShown(true);
            doneRef.current?.();
            if (onProgress) onProgress();
            return undefined;
        }
        // Стартуем со скрытого состояния и на следующем кадре проявляем —
        // CSS-transition (.t-stream-in → .is-in) делает мягкое fade+blur.
        setShown(false);
        const raf = requestAnimationFrame(() => {
            setShown(true);
            if (onProgress) onProgress();
        });
        // Сообщаем «готово» практически сразу — контент уже весь на месте,
        // печатать нечего; ChatView может снимать флаг анимации.
        const done = setTimeout(() => doneRef.current?.(), 60);
        return () => { cancelAnimationFrame(raf); clearTimeout(done); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content]);

    return (
        <div ref={wrapRef} className={`t-stream-in ${shown ? 'is-in' : ''}`}>
            <MessageRenderer content={content} />
        </div>
    );
}
