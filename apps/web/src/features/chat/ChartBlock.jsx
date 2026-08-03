import { useMemo, useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { copyToCb } from '@/shared/lib/clipboard';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ChartBlock — SVG-виджет линейных и столбчатых графиков
// ==========================================
// Рендерится MessageRenderer'ом, когда модель прислала блок ```chart
// с JSON-конфигом. Пример конфига:
//   {
//     "type": "line" | "bar",
//     "title": "Продажи по месяцам",
//     "xLabel": "Месяц",
//     "yLabel": "Тысяч ₽",
//     "data": [
//       { "name": "Янв", "value": 120 },
//       { "name": "Фев", "value": 180 }
//     ]
//   }
// Мульти-серии — любой ключ кроме name трактуется как серия:
//     { "name": "Янв", "продажи": 120, "прибыль": 30 }
//
// Собственный SVG-рендер вместо recharts/chart.js: экономим ~200КБ
// в бандле, получаем полный контроль над стилем под дизайн Void Code
// (фиолетовый градиент, тонкая сетка, тёмный фон).

const PALETTE = ['#7c3aed', '#a855f7', '#ec4899', '#f59e0b', '#22d3ee', '#10b981'];

// Пытается разобрать содержимое блока как JSON. Модель иногда обрамляет
// объект пробелами/переносами, потому trim() и try/catch.
function parseChartConfig(raw) {
    try {
        const cfg = JSON.parse(raw.trim());
        if (!cfg || typeof cfg !== 'object') return null;
        if (!Array.isArray(cfg.data) || cfg.data.length === 0) return null;
        return cfg;
    } catch (e) {
        return null;
    }
}

// Извлекает набор серий: для каждого объекта в data берёт все числовые
// ключи (кроме name/label). Порядок — по порядку появления в первом объекте.
function extractSeries(data) {
    const first = data[0] || {};
    const nameKey = 'name' in first ? 'name' : (('label' in first) ? 'label' : Object.keys(first)[0]);
    const series = [];
    Object.keys(first).forEach(k => {
        if (k === nameKey) return;
        if (typeof first[k] === 'number') series.push(k);
    });
    // На случай если модель прислала { name, value } — добавим value явно
    if (series.length === 0 && 'value' in first) series.push('value');
    return { nameKey, series };
}

// Красивое округление максимума до "приятной" шкалы (100, 150, 200, 500...).
function niceMax(value) {
    if (value <= 0) return 10;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const norm = value / base;
    let nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * base;
}

export function ChartBlock({ code }) {
    const cfg = useMemo(() => parseChartConfig(code), [code]);
    const rootRef = useRef(null);
    const [copied, setCopied] = useState(false);

    // Анимация появления линий/столбцов при монтировании
    useGSAP(() => {
        if (!cfg || !rootRef.current) return;
        // Линии — обводкой, столбцы — ростом снизу
        const paths = rootRef.current.querySelectorAll('.chart-line');
        paths.forEach(p => {
            const len = p.getTotalLength ? p.getTotalLength() : 500;
            gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
            gsap.to(p, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out' });
        });
        const bars = rootRef.current.querySelectorAll('.chart-bar');
        bars.forEach((b, i) => {
            gsap.from(b, { scaleY: 0, transformOrigin: 'bottom', duration: 0.6, delay: i * 0.04, ease: 'power3.out' });
        });
        const dots = rootRef.current.querySelectorAll('.chart-dot');
        gsap.from(dots, { scale: 0, transformOrigin: 'center', duration: 0.4, delay: 0.8, stagger: 0.03, ease: 'back.out(2)' });
    }, { scope: rootRef, dependencies: [cfg] });

    const handleCopy = () => {
        copyToCb(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Битый JSON. Если код похож на «недописанный» (нет закрывающей }
    // или ещё идёт печать) — покажем placeholder «строим график». Так
    // TypewriterMessage не будет мигать красной ошибкой во время печати.
    if (!cfg) {
        const looksIncomplete = !code.trim().endsWith('}') || code.trim().length < 20;
        if (looksIncomplete) {
            return (
                <div ref={rootRef} className="my-3 rounded-2xl overflow-hidden border border-gray-800 bg-[#0f0f1a] shadow-sm">
                    <div className="flex items-center justify-between px-3 py-2 bg-[#181828] border-b border-gray-800/70">
                        <span className="text-[10px] font-semibold tracking-wider text-gray-400">CHART</span>
                    </div>
                    <div className="px-4 py-6 flex items-center justify-center gap-2 text-gray-400 text-sm">
                        <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        <span>Строим график…</span>
                    </div>
                </div>
            );
        }
        return (
            <div ref={rootRef} className="my-3 rounded-2xl overflow-hidden border border-gray-800 bg-[#0f0f1a] shadow-sm">
                <div className="flex items-center justify-between px-3 py-2 bg-[#181828] border-b border-gray-800/70">
                    <span className="text-[10px] font-semibold tracking-wider text-red-400">CHART (ошибка JSON)</span>
                    <button onClick={handleCopy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700/50 transition-colors">
                        {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                </div>
                <pre className="p-3 text-[12px] text-gray-300 font-mono whitespace-pre-wrap break-all">{code}</pre>
            </div>
        );
    }

    const type = cfg.type === 'bar' ? 'bar' : 'line';
    const title = cfg.title || (type === 'bar' ? 'Столбчатый график' : 'Линейный график');
    const { nameKey, series } = extractSeries(cfg.data);

    // Геометрия SVG. viewBox фиксированный, реальный размер — по контейнеру.
    const W = 640, H = 300;
    const P = { top: 24, right: 20, bottom: 42, left: 44 };
    const plotW = W - P.left - P.right;
    const plotH = H - P.top - P.bottom;

    // Максимум по всем сериям, округлённый до приятной шкалы
    let rawMax = 0;
    cfg.data.forEach(row => series.forEach(s => {
        const v = Number(row[s]);
        if (Number.isFinite(v) && v > rawMax) rawMax = v;
    }));
    const yMax = niceMax(rawMax || 10);
    const yTicks = 4;
    const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMax * (i / yTicks));

    // Координаты
    const xFor = (i) => P.left + (cfg.data.length <= 1 ? plotW / 2 : (i * plotW) / (cfg.data.length - 1));
    const yFor = (v) => P.top + plotH - (v / yMax) * plotH;

    // Для bar — своя раскладка (равномерные полосы с зазором)
    const barSlot = plotW / cfg.data.length;
    const barGroupWidth = barSlot * 0.7;
    const barWidth = barGroupWidth / Math.max(1, series.length);
    const xBar = (i, s) => P.left + i * barSlot + (barSlot - barGroupWidth) / 2 + s * barWidth;

    return (
        <div ref={rootRef} className="my-3 rounded-2xl overflow-hidden border border-gray-800 bg-[#0f0f1a] shadow-sm">
            {/* Шапка */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#181828] border-b border-gray-800/70">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899]" />
                    <span className="ml-2 text-[11px] font-semibold tracking-wider text-gray-300 truncate">
                        {title.toUpperCase()}
                    </span>
                </div>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700/50 transition-colors flex-shrink-0"
                    title="Копировать данные графика"
                >
                    <Icons.Copy className="w-3.5 h-3.5" />
                    {copied ? 'Скопировано' : 'JSON'}
                </button>
            </div>

            {/* SVG */}
            <div className="px-3 py-3 bg-[#0f0f1a]">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                    {/* Горизонтальная сетка + подписи Y */}
                    {ticks.map((t, i) => {
                        const y = yFor(t);
                        return (
                            <g key={i}>
                                <line x1={P.left} y1={y} x2={W - P.right} y2={y} stroke="#2a2a3c" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3,4'} />
                                <text x={P.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8a8ab0" fontFamily="system-ui, sans-serif">
                                    {Number.isInteger(t) ? t : t.toFixed(1)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Подписи X */}
                    {cfg.data.map((row, i) => {
                        const label = String(row[nameKey] ?? '');
                        const x = type === 'bar' ? P.left + i * barSlot + barSlot / 2 : xFor(i);
                        return (
                            <text key={i} x={x} y={H - P.bottom + 18} textAnchor="middle" fontSize="11" fill="#8a8ab0" fontFamily="system-ui, sans-serif">
                                {label.length > 8 ? label.slice(0, 8) + '…' : label}
                            </text>
                        );
                    })}

                    {/* Данные */}
                    {type === 'line' && series.map((s, si) => {
                        const color = PALETTE[si % PALETTE.length];
                        const d = cfg.data.map((row, i) => {
                            const v = Number(row[s]) || 0;
                            return `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`;
                        }).join(' ');
                        return (
                            <g key={s}>
                                <path className="chart-line" d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                {cfg.data.map((row, i) => {
                                    const v = Number(row[s]) || 0;
                                    return <circle key={i} className="chart-dot" cx={xFor(i)} cy={yFor(v)} r="3.5" fill={color} />;
                                })}
                            </g>
                        );
                    })}

                    {type === 'bar' && cfg.data.map((row, i) => (
                        <g key={i}>
                            {series.map((s, si) => {
                                const v = Number(row[s]) || 0;
                                const x = xBar(i, si);
                                const y = yFor(v);
                                const h = P.top + plotH - y;
                                const color = PALETTE[si % PALETTE.length];
                                return <rect key={s} className="chart-bar" x={x} y={y} width={barWidth * 0.85} height={Math.max(0, h)} fill={color} rx="3" />;
                            })}
                        </g>
                    ))}

                    {/* Подпись оси Y */}
                    {cfg.yLabel && (
                        <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" fontSize="11" fill="#8a8ab0" fontFamily="system-ui, sans-serif">
                            {cfg.yLabel}
                        </text>
                    )}
                    {/* Подпись оси X */}
                    {cfg.xLabel && (
                        <text x={P.left + plotW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#8a8ab0" fontFamily="system-ui, sans-serif">
                            {cfg.xLabel}
                        </text>
                    )}
                </svg>

                {/* Легенда — только если серий больше одной */}
                {series.length > 1 && (
                    <div className="flex flex-wrap gap-3 justify-center mt-2 px-2">
                        {series.map((s, i) => (
                            <div key={s} className="flex items-center gap-1.5 text-[11px] text-gray-300">
                                <span className="w-3 h-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                                <span>{s}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
