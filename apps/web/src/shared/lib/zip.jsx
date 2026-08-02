// ==========================================
// Мини-генератор ZIP-архивов без внешних зависимостей
// ==========================================
// Собирает валидный .zip прямо в браузере из набора файлов { name, content }.
// Используется режим STORE (без сжатия) — это упрощает реализацию и не
// требует тянуть JSZip/pako. Для набора текстовых файлов кода размер архива
// практически не важен, а надёжность и нулевые зависимости — важнее.
//
// Формат ZIP (STORE): для каждого файла пишем Local File Header + данные,
// затем общий Central Directory и End Of Central Directory record.
// Спецификация: PKWARE APPNOTE.

// Таблица CRC32 (стандартный полином 0xEDB88320) — считается один раз.
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Небольшой помощник для сборки бинарного буфера из кусков.
function concatBytes(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

function u16(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}
function u32(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

// files: [{ name: 'index.html', content: '...' }]
// Возвращает Blob типа application/zip.
export function createZipBlob(files) {
    const encoder = new TextEncoder();
    const fileRecords = [];
    const centralRecords = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const dataBytes = encoder.encode(file.content ?? '');
        const crc = crc32(dataBytes);
        const size = dataBytes.length;

        // Local File Header
        const localHeader = concatBytes([
            u32(0x04034b50), // signature
            u16(20),         // version needed
            u16(0),          // flags
            u16(0),          // compression = STORE
            u16(0),          // mod time
            u16(0),          // mod date
            u32(crc),        // CRC-32
            u32(size),       // compressed size
            u32(size),       // uncompressed size
            u16(nameBytes.length), // file name length
            u16(0),          // extra field length
            nameBytes,
        ]);

        fileRecords.push(localHeader, dataBytes);

        // Central Directory Header (запомним для финального блока)
        const centralHeader = concatBytes([
            u32(0x02014b50), // signature
            u16(20),         // version made by
            u16(20),         // version needed
            u16(0),          // flags
            u16(0),          // compression
            u16(0),          // mod time
            u16(0),          // mod date
            u32(crc),
            u32(size),
            u32(size),
            u16(nameBytes.length),
            u16(0),          // extra field length
            u16(0),          // comment length
            u16(0),          // disk number start
            u16(0),          // internal attrs
            u32(0),          // external attrs
            u32(offset),     // offset of local header
            nameBytes,
        ]);
        centralRecords.push(centralHeader);

        offset += localHeader.length + dataBytes.length;
    }

    const centralDir = concatBytes(centralRecords);
    const centralOffset = offset;
    const centralSize = centralDir.length;

    // End Of Central Directory
    const eocd = concatBytes([
        u32(0x06054b50),
        u16(0),                  // disk number
        u16(0),                  // disk with central dir
        u16(files.length),       // entries on this disk
        u16(files.length),       // total entries
        u32(centralSize),
        u32(centralOffset),
        u16(0),                  // comment length
    ]);

    const all = concatBytes([...fileRecords, centralDir, eocd]);
    return new Blob([all], { type: 'application/zip' });
}

// Скачивает файлы как ZIP-архив с указанным именем.
export function downloadZip(files, zipName = 'void-code.zip') {
    const blob = createZipBlob(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ==========================================
// Подбор имени файла по языку кода
// ==========================================
const EXT_BY_LANG = {
    html: 'html', css: 'css', javascript: 'js', js: 'js', jsx: 'jsx',
    typescript: 'ts', ts: 'ts', tsx: 'tsx', python: 'py', py: 'py',
    json: 'json', java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs',
    go: 'go', rust: 'rs', php: 'php', ruby: 'rb', sql: 'sql',
    yaml: 'yaml', yml: 'yml', markdown: 'md', md: 'md', text: 'txt',
};

export function fileNameForBlock(block, index = 0) {
    const lang = (block.language || 'text').toLowerCase();
    const ext = EXT_BY_LANG[lang] || 'txt';
    // Стандартные имена для веба, чтобы index.html подхватывал style.css/script.js.
    if (lang === 'html') return 'index.html';
    if (lang === 'css') return 'style.css';
    if (lang === 'javascript' || lang === 'js') return 'script.js';
    return `file${index + 1}.${ext}`;
}

// Собирает список файлов из блоков кода (для скачивания всего ответа архивом).
export function blocksToFiles(blocks) {
    const used = {};
    return blocks.map((b, i) => {
        let name = fileNameForBlock(b, i);
        // Избегаем коллизий имён (например два ```js блока).
        if (used[name]) {
            const dot = name.lastIndexOf('.');
            name = `${name.slice(0, dot)}_${used[name] + 1}${name.slice(dot)}`;
        }
        used[fileNameForBlock(b, i)] = (used[fileNameForBlock(b, i)] || 0) + 1;
        return { name, content: b.content };
    });
}
