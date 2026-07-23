import { useState } from 'react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// FeedbackModal — сбор обратной связи по ответу ИИ
// ==========================================
// Открывается при клике на 👍 / 👎. Пользователь выбирает причину из тегов
// и/или пишет свой текст. Для лайка и дизлайка — разные наборы тегов.

const POSITIVE_TAGS = ['Точный ответ', 'Хорошо объяснено', 'Помогло решить задачу', 'Быстро', 'Красивое оформление'];
const NEGATIVE_TAGS = ['Неверная информация', 'Не по теме', 'Слишком длинно', 'Слишком коротко', 'Не выполнил просьбу', 'Плохой код'];

export function FeedbackModal({ type, onSubmit, onClose }) {
    const positive = type === 'like';
    const tags = positive ? POSITIVE_TAGS : NEGATIVE_TAGS;
    const [selected, setSelected] = useState([]);
    const [text, setText] = useState('');

    const toggle = (tag) => setSelected(s => s.includes(tag) ? s.filter(t => t !== tag) : [...s, tag]);
    const submit = () => { onSubmit?.({ type, tags: selected, text: text.trim() }); onClose(); };

    return (
        <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-darkCard w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl slide-in-right" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-1">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${positive ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500'}`}>
                        <Icons.ThumbsUp className={`w-5 h-5 ${positive ? '' : 'rotate-180'}`} />
                    </div>
                    <h4 className="font-extrabold text-lg dark:text-white">{positive ? 'Что понравилось?' : 'Что пошло не так?'}</h4>
                    <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icons.X /></button>
                </div>
                <p className="text-sm text-gray-400 mb-4">Выберите причины или напишите своё — это поможет нам стать лучше.</p>

                <div className="flex flex-wrap gap-2 mb-4">
                    {tags.map(tag => {
                        const on = selected.includes(tag);
                        return (
                            <button key={tag} onClick={() => toggle(tag)} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${on ? (positive ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                                {on && <span className="mr-1">✓</span>}{tag}
                            </button>
                        );
                    })}
                </div>

                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Дополнительно (необязательно)…" className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder text-sm dark:text-white outline-none focus:border-[#5b32d4] resize-none mb-4" />

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-sm">Отмена</button>
                    <button onClick={submit} disabled={selected.length === 0 && !text.trim()} className="flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:opacity-40 text-white font-bold text-sm transition-colors">Отправить</button>
                </div>
            </div>
        </div>
    );
}
