import { useEffect, useRef } from 'react';

// ==========================================
// ShaderCard — премиальная карточка с живым WebGL-фоном (задача 7)
// ==========================================
// Техника взята из ShaderCard (мягкий размытый plasma/noise на WebGL),
// но палитра, копирайт и вся обвязка — свои, Void Code AI: фирменный
// фиолетово-синий вместо бирюзы референса. Никакого чужого брендинга.
//
// Почему WebGL, а не CSS-градиент: нужен именно медленно «дышащий»
// плазменный фон с плавным перетеканием пятен. На CSS это делается
// анимацией background-position у нескольких radial-gradient, что
// заставляет браузер перерисовывать (paint) большую площадь каждый кадр
// и заметно греет мобильные устройства. Фрагментный шейдер считает то же
// самое на GPU за один проход.
//
// Производительность: рендер ПОЛНОСТЬЮ останавливается, когда карточка
// уходит из вьюпорта (IntersectionObserver) или вкладка скрыта — на
// мобильном это принципиально, иначе три карточки тарифов молотили бы
// GPU постоянно. Также уважаем prefers-reduced-motion: там рисуем один
// статичный кадр и не запускаем цикл вовсе.

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Плазма: несколько слоёв simplex-подобного шума, смешанных по времени.
// Итог мягко размывается (smoothstep по яркости) — отсюда «mild blur».
const FRAG = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_color;
uniform vec3  u_color2;
uniform vec3  u_bg;
uniform float u_opacity;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                 + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * 2.2;
  float t = u_time * 0.06;

  // Три слоя разного масштаба — крупные пятна плюс мелкая «дымка».
  float n  = snoise(p + vec2(t, -t));
  n += 0.5  * snoise(p * 2.1 + vec2(-t * 1.3, t * 0.7));
  n += 0.25 * snoise(p * 4.3 + vec2(t * 0.5, t * 1.1));
  n = n / 1.75;

  // Мягкие границы пятен: без резких контуров, как размытая плазма.
  float glow = smoothstep(-0.35, 0.85, n);
  glow = pow(glow, 1.35);

  vec3 col = mix(u_bg, mix(u_color, u_color2, smoothstep(0.15, 0.95, glow)), glow * u_opacity);

  // Лёгкое затемнение к низу — под текст и CTA внизу карточки.
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.75, uv.y));

  gl_FragColor = vec4(col, 1.0);
}
`;

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const int = parseInt(full, 16);
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

export function ShaderCard({
    // Палитра Void Code AI: фиолетовый бренда + синий акцент, тёмная база.
    color = '#5b32d4',
    color2 = '#2f6bff',
    bgColor = '#0d0b1a',
    speed = 1,
    opacity = 0.85,
    className = '',
    children,
}) {
    const canvasRef = useRef(null);
    const hostRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const host = hostRef.current;
        if (!canvas || !host) return undefined;

        const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false });
        // Нет WebGL (старый браузер/выключено) — оставляем однотонный фон
        // из CSS, карточка просто не «дышит». Ничего не ломается.
        if (!gl) return undefined;

        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
        };
        const vs = compile(gl.VERTEX_SHADER, VERT);
        const fs = compile(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return undefined;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const uRes = gl.getUniformLocation(prog, 'u_res');
        const uTime = gl.getUniformLocation(prog, 'u_time');
        gl.uniform3fv(gl.getUniformLocation(prog, 'u_color'), hexToRgb(color));
        gl.uniform3fv(gl.getUniformLocation(prog, 'u_color2'), hexToRgb(color2));
        gl.uniform3fv(gl.getUniformLocation(prog, 'u_bg'), hexToRgb(bgColor));
        gl.uniform1f(gl.getUniformLocation(prog, 'u_opacity'), opacity);

        // На мобильных ограничиваем DPR: полный retina-рендер плазмы даёт
        // вчетверо больше пикселей без заметной разницы на глаз (фон и так
        // размытый), зато ощутимо жрёт батарею.
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const resize = () => {
            const w = Math.max(1, Math.floor(host.clientWidth * dpr));
            const h = Math.max(1, Math.floor(host.clientHeight * dpr));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w; canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
            gl.uniform2f(uRes, canvas.width, canvas.height);
        };
        resize();

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const draw = (tSec) => {
            gl.uniform1f(uTime, tSec);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        if (reduce) {
            // Один статичный кадр — движения нет, вид сохраняется.
            draw(0);
            const ro = new ResizeObserver(() => { resize(); draw(0); });
            ro.observe(host);
            return () => ro.disconnect();
        }

        let raf = 0;
        let running = false;
        let start = 0;
        const loop = (now) => {
            if (!running) return;
            if (!start) start = now;
            resize();
            draw(((now - start) / 1000) * speed);
            raf = requestAnimationFrame(loop);
        };
        const play = () => {
            if (running) return;
            running = true;
            start = 0;
            raf = requestAnimationFrame(loop);
        };
        const stop = () => { running = false; cancelAnimationFrame(raf); };

        // Карточка вне экрана или вкладка в фоне — не рисуем вообще.
        const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? play() : stop()), { threshold: 0.05 });
        io.observe(host);
        const onVis = () => (document.hidden ? stop() : play());
        document.addEventListener('visibilitychange', onVis);
        const ro = new ResizeObserver(resize);
        ro.observe(host);

        return () => {
            stop();
            io.disconnect();
            ro.disconnect();
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [color, color2, bgColor, speed, opacity]);

    return (
        <div
            ref={hostRef}
            className={`relative overflow-hidden rounded-[20px] border border-white/10 ${className}`}
            style={{ backgroundColor: bgColor, boxShadow: '0 18px 50px -20px rgba(91,50,212,0.55)' }}
        >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
            {/* Затемняющая вуаль под текст: плазма яркая, без неё контраст
                текста на светлых пятнах падает ниже читаемого. */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/65 pointer-events-none" aria-hidden="true" />
            <div className="relative">{children}</div>
        </div>
    );
}
