import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// GeneratedImage — сгенерированное DALL-E картинка в чате
// ==========================================
// Отличия от прошлой мини-версии (240px в углу):
//   • Крупный превью на всю ширину сообщения (до 560px), чтобы деталь
//     картинки было видно без открытия в новой вкладке.
//   • Иконка «Скачать» плавает в ЛЕВОМ НИЖНЕМ углу картинки — не пересекается
//     с текстом и не перекрывает лицо/центр изображения.
//   • На мобильных срабатывает long-press (≈500 мс): всплывает мини-меню
//     «Копировать / Скачать / Поделиться», анимированное на GSAP
//     (scale+autoAlpha). Отпуск/клик снаружи закрывает меню.
//
// Клик на самой картинке всегда открывает её в новой вкладке — быстрый
// доступ к полному разрешению.

async function copyImageToClipboard(url) {
    try {
        // Modern browsers: ClipboardItem с blob'ом картинки.
        const res = await fetch(url);
        const blob = await res.blob();
        if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            return true;
        }
    } catch { /* fallthrough */ }
    // Фолбэк: копируем хотя бы URL как текст.
    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch { return false; }
}

async function downloadImage(url, filename = 'void-code-ai.png') {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch {
        // Прямой фолбэк — просто открыть в новой вкладке.
        window.open(url, '_blank');
    }
}

async function shareImage(url, prompt) {
    try {
        if (navigator.share) {
            const res = await fetch(url);
            const blob = await res.blob();
            const file = new File([blob], 'void-code-ai.png', { type: blob.type });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Void Code AI', text: prompt || '' });
                return true;
            }
            await navigator.share({ url, title: 'Void Code AI', text: prompt || '' });
            return true;
        }
    } catch { /* пользователь мог отменить — молча */ }
    // Фолбэк: копируем URL.
    try { await navigator.clipboard.writeText(url); return true; } catch { return false; }
}

export function GeneratedImage({ url, prompt = '', idx = 0, onEdit }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [toast, setToast] = useState('');
    const wrapRef = useRef(null);
    const menuRef = useRef(null);
    const pressTimerRef = useRef(null);

    // GSAP-анимация появления/скрытия меню.
    useGSAP(() => {
        if (!menuRef.current) return;
        if (menuOpen) {
            gsap.fromTo(menuRef.current,
                { autoAlpha: 0, scale: 0.85, y: 8 },
                { autoAlpha: 1, scale: 1, y: 0, duration: 0.22, ease: 'back.out(1.6)' });
        }
    }, { scope: wrapRef, dependencies: [menuOpen] });

    // Клик вне меню — закрыть.
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('touchstart', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, [menuOpen]);

    // Long-press на мобильном (touchstart → 500 мс).
    const startPress = () => {
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
        pressTimerRef.current = setTimeout(() => {
            setMenuOpen(true);
            // haptic-фидбэк, если доступен
            if (window.navigator?.vibrate) window.navigator.vibrate(20);
        }, 500);
    };
    const cancelPress = () => {
        if (pressTimerRef.current) {
            clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }
    };

    const showToast = (text) => {
        setToast(text);
        setTimeout(() => setToast(''), 1600);
    };

    const filename = `void-code-ai-${idx}-${Date.now()}.png`;

    const handleCopy = async () => {
        const ok = await copyImageToClipboard(url);
        setMenuOpen(false);
        showToast(ok ? 'Скопировано' : 'Не удалось скопировать');
    };
    const handleDownload = async () => {
        await downloadImage(url, filename);
        setMenuOpen(false);
        showToast('Загружено');
    };
    const handleShare = async () => {
        const ok = await shareImage(url, prompt);
        setMenuOpen(false);
        if (ok) showToast('Отправлено');
    };

    return (
        <div ref={wrapRef} className="relative inline-block max-w-full">
            <div
                className="relative rounded-2xl overflow-hidden shadow-md select-none void-generated-image"
                onTouchStart={startPress}
                onTouchEnd={cancelPress}
                onTouchMove={cancelPress}
                onTouchCancel={cancelPress}
                onContextMenu={(e) => {
                    // На ПК long-press-меню тоже даём — через правую кнопку.
                    e.preventDefault();
                    setMenuOpen(true);
                }}
            >
                {/* Задача 5: ограничиваем максимальный размер картинки
                    (max-w-sm) и держим строго квадратные пропорции
                    (aspect-square + object-cover) — ТОЧНО тот же размер и
                    те же классы использует «холст»-скелетон в
                    ImageGenLoader, поэтому в момент появления готовой
                    картинки макет не «прыгает». */}
                <button type="button" onClick={() => onEdit?.(url)} className="block w-full max-w-[15rem] sm:max-w-[17rem]">
                    <img
                        src={url}
                        alt={prompt || 'Сгенерированное изображение'}
                        className="block w-full aspect-square object-cover"
                        draggable={false}
                    />
                </button>
                {/* Кнопка «скачать» — в левом нижнем углу картинки */}
                <button
                    onClick={handleDownload}
                    title="Скачать изображение"
                    className="absolute left-2.5 bottom-2.5 w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                >
                    <Icons.Download className="w-4 h-4" />
                </button>
            </div>

            {/* Long-press меню: Копировать / Скачать / Поделиться */}
            {menuOpen && (
                <div
                    ref={menuRef}
                    className="absolute z-40 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-darkCard border border-gray-200 dark:border-darkBorder shadow-2xl min-w-[180px]"
                    style={{ opacity: 0 }} // GSAP развернёт до 1
                >
                    <button onClick={handleCopy} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors dark:text-white">
                        <Icons.Copy className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" /> Копировать
                    </button>
                    <button onClick={handleDownload} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors dark:text-white border-t border-gray-100 dark:border-gray-800">
                        <Icons.Download className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" /> Скачать
                    </button>
                    <button onClick={handleShare} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors dark:text-white border-t border-gray-100 dark:border-gray-800">
                        <Icons.Share className="w-4 h-4 text-[#5b32d4] dark:text-purple-400" /> Поделиться
                    </button>
                </div>
            )}

            {toast && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-10 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shadow-lg fade-in">
                    {toast}
                </div>
            )}
        </div>
    );
}
