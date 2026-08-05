import { useRef, useEffect, useState, useCallback } from 'react';
import { gsap } from 'gsap';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ImageEditorModal — полноэкранный редактор изображений
// ==========================================
// Открывается по клику на превью вложения в поле ввода ИЛИ по клику на
// сгенерированную ИИ картинку в чате (задача 11).
//
// UI:
//   • крестик слева сверху — закрыть без сохранения (вернуться в чат);
//   • галочка справа сверху — применить изменения и вернуть новый data-URL
//     наверх через onApply(dataUrl);
//   • снизу по центру — переключатель инструментов «Рисовать» / «Текст».
//
// Логика:
//   • «Рисовать» (по умолчанию) — Canvas поверх изображения, рисование
//     пальцем/мышью текущим выбранным цветом. Полоска цветов сверху
//     появляется только в этом режиме.
//   • «Текст» — клик по изображению ставит текстовое поле в это место;
//     можно перетаскивать уже поставленный текст, вводить содержимое.
//
// Все переходы (открытие/закрытие модалки, переключение инструментов)
// анимированы через GSAP — согласно требованию проекта, никаких CSS
// transition для этих переходов.

const COLORS = ['#ffffff', '#000000', '#5b32d4', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899'];

export function ImageEditorModal({ image, onClose, onApply }) {
    const overlayRef = useRef(null);
    const panelRef = useRef(null);
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const containerRef = useRef(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef(null);

    const [tool, setTool] = useState('draw'); // 'draw' | 'text'
    const [color, setColor] = useState('#ef4444');
    const [brushSize] = useState(6);
    const [textItems, setTextItems] = useState([]); // {id, x, y, value}
    const [activeTextId, setActiveTextId] = useState(null);
    const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

    // ---- История для Undo/Redo ----
    // Каждый снимок — { canvasData: dataURL рисунка (без учёта текстовых
    // слоёв, они отдельным массивом) | null, textItems }. Храним в рефах
    // (не в state), чтобы не тянуть за собой лишние ре-рендеры на каждый
    // мазок кистью — а видимость кнопок Undo/Redo обновляем через
    // отдельный лёгкий счётчик historyTick.
    const historyRef = useRef([]);
    const historyIndexRef = useRef(-1);
    const isRestoringRef = useRef(false);
    const hadMovedRef = useRef(false);
    const [historyTick, setHistoryTick] = useState(0);

    // ---- Открытие модалки: GSAP fade+scale ----
    useEffect(() => {
        const overlay = overlayRef.current;
        const panel = panelRef.current;
        if (!overlay || !panel) return;
        gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: 'power2.out' });
        gsap.fromTo(panel, { autoAlpha: 0, scale: 0.92, y: 16 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.32, ease: 'back.out(1.6)' });
    }, []);

    const closeAnimated = useCallback((after) => {
        const overlay = overlayRef.current;
        const panel = panelRef.current;
        if (!overlay || !panel) { after?.(); return; }
        gsap.to(panel, { autoAlpha: 0, scale: 0.94, y: 10, duration: 0.2, ease: 'power2.in' });
        gsap.to(overlay, { autoAlpha: 0, duration: 0.24, ease: 'power2.in', delay: 0.02, onComplete: after });
    }, []);

    const handleClose = () => closeAnimated(onClose);

    // ---- Переключение инструмента — GSAP-анимация тулбара ----
    const toolbarRef = useRef(null);
    const switchTool = (next) => {
        if (next === tool) return;
        setTool(next);
        setActiveTextId(null);
        if (toolbarRef.current) {
            gsap.fromTo(toolbarRef.current, { scale: 0.9, autoAlpha: 0.6 }, { scale: 1, autoAlpha: 1, duration: 0.22, ease: 'back.out(2)' });
        }
    };

    // ---- Canvas: подгонка размера под изображение ----
    useEffect(() => {
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (!img || !canvas) return;
        const onLoad = () => {
            const w = img.clientWidth;
            const h = img.clientHeight;
            setImgSize({ w, h });
            canvas.width = w;
            canvas.height = h;
            // Первый (пустой) снимок истории — точка, к которой можно
            // вернуться Undo'ом до самого начала.
            if (historyRef.current.length === 0) {
                historyRef.current = [{ canvasData: null, textItems: [] }];
                historyIndexRef.current = 0;
                setHistoryTick((t) => t + 1);
            }
        };
        if (img.complete && img.naturalWidth) onLoad();
        img.addEventListener('load', onLoad);
        window.addEventListener('resize', onLoad);
        return () => {
            img.removeEventListener('load', onLoad);
            window.removeEventListener('resize', onLoad);
        };
    }, [image.src]);

    // ---- История: снимок + запись/откат/повтор ----
    const snapshotCanvasData = () => {
        const canvas = canvasRef.current;
        if (!canvas || !canvas.width || !canvas.height) return null;
        try { return canvas.toDataURL('image/png'); } catch { return null; }
    };

    const pushHistory = useCallback((nextTextItems) => {
        if (isRestoringRef.current) return;
        const snapshot = {
            canvasData: snapshotCanvasData(),
            textItems: (nextTextItems ?? textItems).map((t) => ({ ...t })),
        };
        // Обрезаем «будущее», если перед этим действием был откат назад —
        // как в любом обычном редакторе (новое действие после Undo стирает
        // ветку Redo).
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(snapshot);
        historyIndexRef.current = historyRef.current.length - 1;
        setHistoryTick((t) => t + 1);
    }, [textItems]);

    const restoreSnapshot = (snapshot) => {
        isRestoringRef.current = true;
        setActiveTextId(null);
        setTextItems(snapshot.textItems.map((t) => ({ ...t })));
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) { isRestoringRef.current = false; return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (snapshot.canvasData) {
            const im = new Image();
            im.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
                isRestoringRef.current = false;
            };
            im.src = snapshot.canvasData;
        } else {
            isRestoringRef.current = false;
        }
    };

    const undo = () => {
        if (historyIndexRef.current <= 0) return;
        historyIndexRef.current -= 1;
        restoreSnapshot(historyRef.current[historyIndexRef.current]);
        setHistoryTick((t) => t + 1);
    };
    const redo = () => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current += 1;
        restoreSnapshot(historyRef.current[historyIndexRef.current]);
        setHistoryTick((t) => t + 1);
    };
    const canUndo = historyIndexRef.current > 0;
    const canRedo = historyIndexRef.current < historyRef.current.length - 1;

    // ---- Рисование на Canvas ----
    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDraw = (e) => {
        if (tool !== 'draw') return;
        e.preventDefault();
        drawingRef.current = true;
        hadMovedRef.current = false;
        lastPointRef.current = getPos(e);
    };
    const moveDraw = (e) => {
        if (tool !== 'draw' || !drawingRef.current) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e);
        const last = lastPointRef.current;
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        lastPointRef.current = pos;
        hadMovedRef.current = true;
    };
    const endDraw = () => {
        // Записываем в историю, только если мазок реально что-то нарисовал
        // (иначе случайный клик/тап плодил бы пустые шаги истории).
        if (drawingRef.current && hadMovedRef.current) pushHistory();
        drawingRef.current = false;
        lastPointRef.current = null;
    };

    // ---- Текст: клик по изображению добавляет текстовое поле ----
    const handleImageClick = (e) => {
        if (tool !== 'text') return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = 'txt_' + Date.now();
        setTextItems((prev) => [...prev, { id, x, y, value: '' }]);
        setActiveTextId(id);
    };

    const updateTextItem = (id, patch) => {
        setTextItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    };
    const removeEmptyTexts = () => {
        setTextItems((prev) => prev.filter((t) => t.value.trim() !== ''));
    };
    // По уходу фокуса с текстового поля — чистим пустые поля и фиксируем
    // текущее состояние текста в истории (это и есть «шаг» для Undo/Redo
    // текстового инструмента, аналогично завершению мазка кистью).
    const commitTextEdits = () => {
        setTextItems((prev) => {
            const filtered = prev.filter((t) => t.value.trim() !== '');
            pushHistory(filtered);
            return filtered;
        });
    };

    // ---- Применить изменения: рисуем итоговое изображение на отдельном
    // canvas (исходник + рисунок + текстовые слои) и возвращаем data-URL ----
    const applyChanges = () => {
        removeEmptyTexts();
        const img = imgRef.current;
        const drawCanvas = canvasRef.current;
        if (!img || !drawCanvas) { handleClose(); return; }

        const finalCanvas = document.createElement('canvas');
        // Рендерим в натуральном разрешении исходной картинки для чёткости
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;
        finalCanvas.width = img.naturalWidth;
        finalCanvas.height = img.naturalHeight;
        const ctx = finalCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, finalCanvas.width, finalCanvas.height);
        ctx.drawImage(drawCanvas, 0, 0, finalCanvas.width, finalCanvas.height);

        // Текстовые слои — рисуем поверх с масштабированием координат
        textItems.forEach((t) => {
            const val = t.value.trim();
            if (!val) return;
            const fontSize = Math.round(24 * ((scaleX + scaleY) / 2));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = color;
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = Math.max(2, fontSize * 0.08);
            const x = t.x * scaleX;
            const y = t.y * scaleY;
            ctx.strokeText(val, x, y);
            ctx.fillText(val, x, y);
        });

        const dataUrl = (() => {
            try {
                return finalCanvas.toDataURL('image/png');
            } catch (e) {
                // «Tainted canvas» — внешний URL (например, картинка от
                // Grok/OpenAI) не прислал CORS-заголовки, разрешающие чтение
                // пикселей через canvas. Для собственных data-URL вложений
                // (из галереи пользователя) этой проблемы никогда нет —
                // затрагивает только сгенерированные ИИ картинки на внешнем
                // хостинге без Access-Control-Allow-Origin.
                console.error('[ImageEditorModal] canvas tainted, не удалось экспортировать:', e);
                alert('Не удалось сохранить изменения: изображение размещено на внешнем сервере без разрешения на редактирование (CORS). Попробуйте скачать картинку и загрузить её заново как вложение.');
                return null;
            }
        })();
        if (!dataUrl) return;
        closeAnimated(() => onApply?.(dataUrl));
    };

    return (
        <div
            ref={overlayRef}
            data-modal-overlay
            className="fixed inset-0 z-[200] bg-black flex flex-col"
            style={{ opacity: 0 }}
        >
            {/* Верхняя панель: крестик + Undo/Redo слева, галочка справа */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleClose}
                        className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md flex items-center justify-center text-white transition-colors"
                    >
                        <Icons.X className="w-5 h-5" />
                    </button>
                    {/* Стрелка «назад» — отменить последнее действие */}
                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        title="Отменить действие"
                        className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:hover:bg-white/15 backdrop-blur-md flex items-center justify-center text-white transition-colors"
                    >
                        <Icons.Undo className="w-5 h-5" />
                    </button>
                    {/* Стрелка «вперёд» — вернуть отменённое действие */}
                    <button
                        onClick={redo}
                        disabled={!canRedo}
                        title="Повторить действие"
                        className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:hover:bg-white/15 backdrop-blur-md flex items-center justify-center text-white transition-colors"
                    >
                        <Icons.Redo className="w-5 h-5" />
                    </button>
                </div>
                <button
                    onClick={applyChanges}
                    className="w-10 h-10 rounded-full bg-[#5b32d4] hover:bg-[#4a26b0] flex items-center justify-center text-white transition-colors shadow-lg"
                    title="Применить изменения"
                >
                    <Icons.Check className="w-5 h-5" />
                </button>
            </div>

            {/* Палитра цветов — только в режиме «Рисовать» */}
            {tool === 'draw' && (
                <div className="flex items-center justify-center gap-2 px-4 pb-3 shrink-0 fade-in">
                    {COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-white' : 'border-white/30'}`}
                            style={{ background: c }}
                        />
                    ))}
                </div>
            )}

            {/* Холст с изображением */}
            <div ref={panelRef} className="flex-1 min-h-0 flex items-center justify-center px-3" style={{ opacity: 0 }}>
                <div
                    ref={containerRef}
                    className="relative max-w-full max-h-full"
                    onClick={handleImageClick}
                >
                    <img
                        ref={imgRef}
                        src={image.src}
                        alt=""
                        draggable={false}
                        crossOrigin="anonymous"
                        className="max-w-full max-h-[70vh] object-contain rounded-xl select-none"
                        style={{ display: 'block' }}
                    />
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full touch-none"
                        style={{ cursor: tool === 'draw' ? 'crosshair' : 'text' }}
                        onMouseDown={startDraw}
                        onMouseMove={moveDraw}
                        onMouseUp={endDraw}
                        onMouseLeave={endDraw}
                        onTouchStart={startDraw}
                        onTouchMove={moveDraw}
                        onTouchEnd={endDraw}
                    />
                    {textItems.map((t) => (
                        <input
                            key={t.id}
                            autoFocus={t.id === activeTextId}
                            value={t.value}
                            onChange={(e) => updateTextItem(t.id, { value: e.target.value })}
                            onBlur={commitTextEdits}
                            placeholder="Текст…"
                            className="absolute bg-transparent border-b-2 border-dashed border-white/70 text-white font-bold text-xl outline-none px-1 min-w-[80px]"
                            style={{ left: t.x, top: t.y - 16, color, textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ))}
                </div>
            </div>

            {/* Нижний переключатель инструментов */}
            <div className="flex items-center justify-center gap-2 py-5 shrink-0">
                <div ref={toolbarRef} className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-1">
                    <button
                        onClick={() => switchTool('draw')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-colors ${tool === 'draw' ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
                    >
                        <Icons.Pencil className="w-4 h-4" /> Рисовать
                    </button>
                    <button
                        onClick={() => switchTool('text')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-colors ${tool === 'text' ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
                    >
                        <Icons.Type className="w-4 h-4" /> Текст
                    </button>
                </div>
            </div>
        </div>
    );
}
