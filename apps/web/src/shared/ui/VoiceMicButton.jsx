import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// VoiceMicButton — кнопка микрофона с GSAP-анимацией записи
// ==========================================
// В покое — фиолетовый значок. При записи GSAP запускает: пульсирующий
// ореол вокруг кнопки (расходится и гаснет) и лёгкое «дыхание» самой
// иконки. Анимации создаются в useGSAP() со scope и живут только пока
// listening === true (зависимость), при остановке записи автоматически
// откатываются — никаких висящих твинов на скрытой кнопке
// (gsap-react + gsap-core skills). Уважаем prefers-reduced-motion.

export function VoiceMicButton({ voice, size = 'md', className = '' }) {
    const scope = useRef(null);
    if (!voice.supported) return null;
    const dims = size === 'sm' ? 'w-10 h-10' : 'w-11 h-11';

    return <MicButtonInner voice={voice} dims={dims} className={className} scope={scope} />;
}

function MicButtonInner({ voice, dims, className, scope }) {
    useGSAP(() => {
        if (!voice.listening) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        // Ореол записи — расходится и гаснет по кругу
        gsap.fromTo('.mic-ring',
            { scale: 0.8, autoAlpha: 0.6 },
            { scale: 1.8, autoAlpha: 0, duration: 1.4, ease: 'power1.out', repeat: -1 });
        // Дыхание иконки
        gsap.to('.mic-icon', { scale: 1.15, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }, { scope, dependencies: [voice.listening] });

    return (
        <div ref={scope} className="relative shrink-0 flex items-center justify-center">
            {voice.listening && (
                <span className="mic-ring absolute inset-0 rounded-xl bg-[#5b32d4] pointer-events-none" />
            )}
            <button
                onClick={voice.toggle}
                title="Голосовой ввод"
                className={`relative ${dims} rounded-xl flex items-center justify-center shrink-0 transition-colors ${voice.listening ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400 hover:bg-gray-200 dark:hover:bg-gray-700'} ${className}`}
            >
                <Icons.Mic className="mic-icon w-4 h-4" />
            </button>
        </div>
    );
}

// Живой эквалайзер + промежуточный текст (для отображения в поле ввода).
// Столбики анимируются GSAP-таймлайном: каждый колеблется по высоте со
// своим смещением фазы — получается «дышащая» звуковая дорожка.
export function VoiceListeningBars({ interim, compact = false }) {
    const scope = useRef(null);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        const bars = gsap.utils.toArray('.vlb-bar', scope.current);
        bars.forEach((bar, i) => {
            gsap.to(bar, {
                scaleY: gsap.utils.random(0.4, 1),
                duration: gsap.utils.random(0.35, 0.6),
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
                delay: i * 0.08,
            });
        });
    }, { scope });

    return (
        <span ref={scope} className={`flex items-center gap-2.5 ${compact ? 'text-sm' : 'text-[16px]'} truncate`}>
            <span className="flex items-end gap-0.5 h-4 shrink-0">
                <span className="vlb-bar w-1 h-4 rounded-full bg-[#5b32d4] origin-bottom" />
                <span className="vlb-bar w-1 h-4 rounded-full bg-[#7b4fe0] origin-bottom" />
                <span className="vlb-bar w-1 h-4 rounded-full bg-[#9d16e0] origin-bottom" />
                <span className="vlb-bar w-1 h-4 rounded-full bg-[#7b4fe0] origin-bottom" />
            </span>
            <span className="truncate text-gray-500 dark:text-gray-300">{interim || 'Слушаю…'}</span>
        </span>
    );
}
