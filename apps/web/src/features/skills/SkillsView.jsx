import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { goBack } from '@/shared/lib/navigation';
import { t } from '@/shared/lib/i18n';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// СКИЛЛЫ — специальные режимы/навыки ИИ
// ==========================================
// Скилл — это преднастроенный режим работы ассистента (например, «Написание
// кода», «Глубокое исследование», «Резюмирование»). Пользователь включает
// нужные скиллы, и они учитываются при ответах. Заменил собой пункт
// «Создать изображение» в меню (генерация картинок доступна через «+» в чате).

export const SKILLS = [
    { id: 'coding', icon: 'Code', name: 'Кодинг', desc: 'Написание и рефакторинг кода уровня Pro' },
    { id: 'research', icon: 'Search', name: 'Исследование', desc: 'Глубокий поиск и анализ информации' },
    { id: 'writing', icon: 'MessageSquare', name: 'Копирайтинг', desc: 'Тексты, посты, письма, документация' },
    { id: 'analysis', icon: 'BarChart', name: 'Аналитика', desc: 'Разбор данных, таблиц и метрик' },
    { id: 'translate', icon: 'Globe', name: 'Перевод', desc: 'Точный перевод между языками' },
    { id: 'summarize', icon: 'Sparkles', name: 'Резюме', desc: 'Краткая выжимка из длинных материалов' },
];

export function SkillsView({ state, updateState }) {
    const lang = state.lang || 'ru';
    const active = state.activeSkills || [];
    const scope = useRef(null);

    useGSAP(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        gsap.from('.skill-card', { autoAlpha: 0, y: 18, duration: 0.4, stagger: 0.06, ease: 'power2.out' });
    }, { scope });

    const toggle = (id) => {
        updateState({ activeSkills: active.includes(id) ? active.filter(s => s !== id) : [...active, id] });
    };

    return (
        <div className="flex-1 overflow-y-auto pb-12 h-full bg-[#f8f9fc] dark:bg-darkBg fade-in w-full">
            <div ref={scope} className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                <div className="flex items-center mb-2 gap-4">
                    <button onClick={() => goBack(state, updateState, 'home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><Icons.ChevronLeft /></button>
                    <h2 className="text-3xl font-extrabold dark:text-white">{t(lang, 'menu.skills')}</h2>
                </div>
                <p className="text-gray-500 dark:text-gray-400 mb-6 ml-1">Включите навыки, которые ассистент будет учитывать при ответах.</p>

                <div className="grid sm:grid-cols-2 gap-3">
                    {SKILLS.map(skill => {
                        const Icon = Icons[skill.icon] || Icons.Sparkles;
                        const on = active.includes(skill.id);
                        return (
                            <button key={skill.id} onClick={() => toggle(skill.id)} className={`skill-card text-left p-4 rounded-2xl border transition-colors ${on ? 'bg-[#efecf9] dark:bg-purple-900/20 border-[#5b32d4]/40' : 'bg-white dark:bg-darkCard border-gray-100 dark:border-darkBorder hover:border-gray-200 dark:hover:border-gray-700'}`}>
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
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
