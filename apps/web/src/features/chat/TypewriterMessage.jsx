import { useState, useEffect } from 'react';
import { MessageRenderer } from '@/features/chat/MessageRenderer';


export function TypewriterMessage({ content, onProgress }) {
    const [disp, setDisp] = useState('');
    useEffect(() => {
        const text = content || '';
        let i = 0;
        // Скорость печати подстраивается под длину ответа: короткие реплики
        // печатаются заметно и плавно, а длинные не растягиваются дольше
        // ~2.2с — крупные "рывки" из старой версии убраны совсем.
        const totalDuration = Math.min(2200, Math.max(450, text.length * 9));
        const tickMs = 16;
        const totalTicks = Math.max(1, Math.round(totalDuration / tickMs));
        const chunkSize = Math.max(1, Math.ceil(text.length / totalTicks));

        setDisp('');
        const timer = setInterval(() => {
            i += chunkSize;
            setDisp(text.slice(0, i));
            if (onProgress) onProgress();
            if (i >= text.length) clearInterval(timer);
        }, tickMs);
        return () => clearInterval(timer);
    }, [content]);
    return <MessageRenderer content={disp} />;
}
