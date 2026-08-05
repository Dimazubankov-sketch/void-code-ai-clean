// ==========================================
// imageCompress — клиентское сжатие фото перед отправкой в чат
// ==========================================
// Проблема: телефонная камера снимает фото 3000-4000px по большой стороне,
// весом 3-8MB. Закодированное в base64 (для Vision-запроса к ИИ) такое
// фото распухает ещё примерно на треть — и даже ОДНО такое вложение легко
// превышало лимит тела запроса, из-за чего сервер отвечал
// «⚠️ Ошибка сервера (HTTP 413)» ещё до того, как запрос доходил до
// логики чата.
//
// Решение: перед конвертацией в data-URL пропускаем файл через canvas —
// уменьшаем большую сторону до MAX_DIMENSION и пережимаем в JPEG с
// качеством QUALITY. Для типового фото это даёт сокращение веса в
// 5-15 раз почти без видимой потери качества для задач Vision (модель
// распознаёт объекты/текст ничуть не хуже на 1600px, чем на 4000px).

const MAX_DIMENSION = 1600; // px — большая сторона после сжатия
const JPEG_QUALITY = 0.8;

// Если файл и так маленький — не тратим время на перекодирование.
const SKIP_COMPRESSION_UNDER_BYTES = 400 * 1024; // 400KB

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

// Сжимает один File (изображение) и возвращает data-URL (JPEG).
// Если сжатие по какой-то причине не удалось (например, HEIC не
// декодируется в браузере) — молча откатываемся на исходный файл как есть,
// чтобы не блокировать отправку сообщения из-за деталей оптимизации.
export async function compressImageToDataUrl(file, opts = {}) {
    const maxDimension = opts.maxDimension || MAX_DIMENSION;
    const quality = opts.quality ?? JPEG_QUALITY;

    if (file.size <= SKIP_COMPRESSION_UNDER_BYTES) {
        try { return await readFileAsDataURL(file); } catch { /* падаем в общий путь ниже */ }
    }

    try {
        const original = await readFileAsDataURL(file);
        const img = await loadImage(original);
        const { naturalWidth: w, naturalHeight: h } = img;
        if (!w || !h) return original;

        const scale = Math.min(1, maxDimension / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const compressed = canvas.toDataURL('image/jpeg', quality);
        // Подстраховка: если сжатая версия почему-то оказалась ТЯЖЕЛЕЕ
        // исходника (бывает на уже сильно сжатых JPEG с малым размером),
        // отдаём исходник.
        return compressed.length < original.length ? compressed : original;
    } catch (e) {
        console.warn('[imageCompress] не удалось сжать изображение, отправляю как есть:', e);
        return readFileAsDataURL(file);
    }
}

// Сжимает список File[] параллельно и возвращает массив data-URL —
// тот же порядок, что и во входном списке.
export async function compressImageFiles(files, opts = {}) {
    return Promise.all(Array.from(files).map((f) => compressImageToDataUrl(f, opts)));
}
