import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// SkillCard — карточка базового скилла с раскрытием деталей
// ==========================================
// Раньше карточка была одной большой <button> — тап включал/выключал
// скилл, и всё. Пользователь попросил добавить возможность прочитать
// подробную информацию: на что влияет скилл и какие библиотеки использует.
// Теперь у карточки две зоны:
//  1) верх (иконка + название + тумблер) — как раньше, тап переключает
//     скилл активным/неактивным;
//  2) стрелочка вниз в правом нижнем углу — раскрывает панель деталей
//     с списком пунктов и упомянутых библиотек. Раскрытие анимировано
//     через GSAP: высота 0 → auto с плавным ease, стрелка крутится
//     на 180° (свернуть).
//
// Раскрытие ВНЕ button-элемента, чтобы не срабатывал toggle при клике
// на детали. Клик по разным зонам обработан через отдельные onClick.

export function SkillCard({ skill, on, onToggle }) {
    const Icon = Icons[skill.icon] || Icons.Sparkles;
    const [expanded, setExpanded] = useState(false);
    const detailsRef = useRef(null);
    const arrowRef = useRef(null);

    // GSAP-раскрытие: анимируем height 0 → auto через промежуточное
    // значение (то, что нужно в пикселях сейчас). autoAlpha сглаживает
    // мерцание содержимого во время смены height.
    useGSAP(() => {
        const el = detailsRef.current;
        if (!el) return;
        if (expanded) {
            gsap.to(el, {
                height: 'auto',
                autoAlpha: 1,
                duration: 0.35,
                ease: 'power2.out',
            });
            gsap.to(arrowRef.current, { rotation: 180, duration: 0.3, ease: 'power2.out' });
        } else {
            gsap.to(el, {
                height: 0,
                autoAlpha: 0,
                duration: 0.28,
                ease: 'power2.in',
            });
            gsap.to(arrowRef.current, { rotation: 0, duration: 0.3, ease: 'power2.out' });
        }
    }, { dependencies: [expanded] });

    return (
        <div className={`skill-card p-4 rounded-2xl border transition-colors ${on ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/40' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder hover:border-gray-200 dark:hover:border-gray-700'}`}>
            {/* Верхняя зона — переключение */}
            <button onClick={onToggle} className="w-full text-left">
                <div className="flex items-start justify-between mb-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${on ? 'bg-[#5b32d4] text-white' : 'bg-gray-100 dark:bg-gray-800 text-[#5b32d4] dark:text-purple-400'}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${on ? 'bg-[#5b32d4]' : 'bg-gray-200 dark:bg-gray-700'}`}>
                        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                </div>
                <p className="font-bold text-[15px] dark:text-white">{skill.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{skill.desc}</p>
            </button>

            {/* Панель деталей — свёрнута до раскрытия */}
            {skill.details && (
                <>
                    <div
                        ref={detailsRef}
                        style={{ height: 0, visibility: 'hidden', opacity: 0, overflow: 'hidden' }}
                        className="mt-3"
                    >
                        <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                            {skill.details.bullets && skill.details.bullets.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5b32d4] dark:text-purple-400 mb-1.5">На что влияет</p>
                                    <ul className="space-y-1">
                                        {skill.details.bullets.map((b, i) => (
                                            <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                                <span className="text-[#5b32d4] dark:text-purple-400 mt-0.5">•</span>
                                                <span>{b}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {skill.details.libs && skill.details.libs.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5b32d4] dark:text-purple-400 mb-1.5">Библиотеки и инструменты</p>
                                    <ul className="space-y-1">
                                        {skill.details.libs.map((lib, i) => (
                                            <li key={i} className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                                <code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{lib}</code>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Стрелочка «развернуть» справа снизу */}
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-[#5b32d4] dark:hover:text-purple-400 transition-colors"
                        >
                            <span>{expanded ? 'Свернуть' : 'Подробнее'}</span>
                            <div ref={arrowRef} className="w-4 h-4 flex items-center justify-center">
                                <Icons.ChevronDown className="w-3.5 h-3.5" />
                            </div>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
