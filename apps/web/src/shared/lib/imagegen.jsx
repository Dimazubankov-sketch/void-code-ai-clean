
// ==========================================
// ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ (полностью офлайн)
// ==========================================
// Детерминированный хэш строки — из одного и того же запроса
// всегда получается одна и та же картинка.
export const hashPromptSeed = (str) => {
    let hash = 0;
    const s = str || 'void code ai';
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) || 1;
};


// Псевдослучайное число в диапазоне от 0 до n на основе seed и "соли" —
// без зависимости от Math.random(), чтобы результат был воспроизводим для одного запроса.
export const seededRandom = (seed, salt, n) => {
    const x = Math.sin(seed * 999 + salt * 37.7) * 10000;
    return (x - Math.floor(x)) * n;
};


// Генерирует уникальную абстрактную SVG-иллюстрацию по тексту запроса.
// Работает полностью в браузере пользователя, без обращения к серверу —
// поэтому "генерация изображений" доступна даже без интернета.
export const generateArtImage = (prompt) => {
    const seed = hashPromptSeed(prompt);
    const hue1 = Math.floor(seededRandom(seed, 1, 360));
    const hue2 = (hue1 + 55 + Math.floor(seededRandom(seed, 2, 140))) % 360;
    const hue3 = (hue1 + 190 + Math.floor(seededRandom(seed, 3, 120))) % 360;

    const blobs = Array.from({ length: 6 }).map((_, i) => {
        const cx = Math.floor(seededRandom(seed, 10 + i, 512));
        const cy = Math.floor(seededRandom(seed, 20 + i, 512));
        const r = 70 + Math.floor(seededRandom(seed, 30 + i, 130));
        const hue = [hue1, hue2, hue3][i % 3];
        const light = 45 + Math.floor(seededRandom(seed, 40 + i, 25));
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue},85%,${light}%)" opacity="0.6" />`;
    }).join('');

    // Несколько тонких дуг поверх для "воид"-стилистики, перекликающейся с логотипом
    const arcs = Array.from({ length: 3 }).map((_, i) => {
        const cx = Math.floor(seededRandom(seed, 50 + i, 512));
        const cy = Math.floor(seededRandom(seed, 60 + i, 512));
        const r = 90 + Math.floor(seededRandom(seed, 70 + i, 90));
        const hue = [hue2, hue3, hue1][i % 3];
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="hsl(${hue},90%,80%)" stroke-width="2" opacity="0.35" />`;
    }).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="hsl(${hue1},70%,18%)" />
                <stop offset="100%" stop-color="hsl(${hue3},65%,12%)" />
            </linearGradient>
            <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38" /></filter>
        </defs>
        <rect width="512" height="512" fill="url(#bg)" />
        <g filter="url(#blur)">${blobs}</g>
        <g>${arcs}</g>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};
