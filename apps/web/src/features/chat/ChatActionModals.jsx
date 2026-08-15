import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ChatActionModals — переименование, удаление, добавление в проект
// ==========================================
// Раньше эти действия жили на window.prompt / window.confirm (а «в
// проект» вообще было заглушкой). Системные диалоги выглядят чужеродно,
// на мобильных обрезаются и не поддаются стилизации — здесь нормальные
// окна в общем стиле приложения, всегда по центру экрана.
//
// Один компонент на три действия: у них общая рамка и поведение, а
// разводить три почти одинаковых модалки значило бы копировать разметку.

function Shell({ icon: Icon, title, children, onClose }) {
    const cardRef = useRef(null);
    useGSAP(() => {
        if (!cardRef.current) return;
        gsap.from(cardRef.current, { y: 18, scale: 0.96, autoAlpha: 0, duration: 0.28, ease: 'power3.out' });
    }, { scope: cardRef });

    // Esc закрывает — привычное поведение для окон.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div ref={cardRef} className="bg-white dark:bg-darkCard w-full max-w-sm rounded-3xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-2xl bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-extrabold text-lg dark:text-white flex-1 min-w-0 truncate">{title}</h4>
                    <button onClick={onClose} className="void-tap-target p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                        <Icons.X className="w-4 h-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body,
    );
}

export function RenameChatModal({ chat, onSave, onClose }) {
    const [title, setTitle] = useState(chat?.title || '');
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

    const save = () => { if (title.trim()) { onSave(title.trim()); onClose(); } };

    return (
        <Shell icon={Icons.Pencil} title="Переименовать чат" onClose={onClose}>
            <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                placeholder="Название чата"
                className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4] mt-2 mb-4"
            />
            <div className="flex gap-2.5">
                <button onClick={onClose} className="void-tap-target flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-white font-bold text-sm">Отмена</button>
                <button onClick={save} disabled={!title.trim()} className="void-tap-target flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-bold text-sm transition-colors">Сохранить</button>
            </div>
        </Shell>
    );
}

export function DeleteChatModal({ chat, onConfirm, onClose }) {
    return (
        <Shell icon={Icons.Trash} title="Удалить чат" onClose={onClose}>
            <p className="text-sm text-gray-500 dark:text-white/60 leading-relaxed mt-1 mb-5">
                Чат «{chat?.title || 'Без названия'}» будет удалён вместе со всей перепиской. Отменить это действие нельзя.
            </p>
            <div className="flex gap-2.5">
                <button onClick={onClose} className="void-tap-target flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-white font-bold text-sm">Отмена</button>
                <button onClick={() => { onConfirm(); onClose(); }} className="void-tap-target flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors">Удалить</button>
            </div>
        </Shell>
    );
}

// «Добавить в проект» работает иначе остальных: сначала нужно выбрать
// проект из существующих ИЛИ создать новый прямо здесь — уводить
// пользователя на отдельный экран ради одного действия избыточно.
export function AddToProjectModal({ chat, projects, onPick, onCreate, onClose }) {
    const [creating, setCreating] = useState(!projects || projects.length === 0);
    const [name, setName] = useState('');
    const listRef = useRef(null);

    useGSAP(() => {
        if (!listRef.current) return;
        gsap.from(listRef.current.children, { y: 10, autoAlpha: 0, duration: 0.24, ease: 'power2.out', stagger: 0.04, clearProps: 'all' });
    }, { dependencies: [creating] });

    const create = () => {
        if (!name.trim()) return;
        onCreate(name.trim());
        onClose();
    };

    return (
        <Shell icon={Icons.Folder} title="Добавить в проект" onClose={onClose}>
            <p className="text-sm text-gray-500 dark:text-white/60 leading-relaxed mt-1 mb-4">
                Проект объединяет чаты в единый контекст: ИИ помнит историю всех чатов проекта.
            </p>

            {creating ? (
                <>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 60))}
                        onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
                        placeholder="Название проекта"
                        autoFocus
                        className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#5b32d4] mb-4"
                    />
                    <div className="flex gap-2.5">
                        {projects?.length > 0 && (
                            <button onClick={() => setCreating(false)} className="void-tap-target flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-white font-bold text-sm">К списку</button>
                        )}
                        <button onClick={create} disabled={!name.trim()} className="void-tap-target flex-1 py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-bold text-sm transition-colors">Создать проект</button>
                    </div>
                </>
            ) : (
                <>
                    <div ref={listRef} className="max-h-64 overflow-y-auto void-no-scrollbar space-y-1.5 mb-4">
                        {projects.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => { onPick(p.id); onClose(); }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                            >
                                <Icons.Folder className="w-4 h-4 text-[#5b32d4] shrink-0" />
                                <span className="font-semibold text-sm dark:text-white truncate flex-1">{p.name || p.title}</span>
                                <Icons.ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setCreating(true)} className="void-tap-target w-full py-3 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        <Icons.Plus className="w-4 h-4" /> Новый проект
                    </button>
                </>
            )}
        </Shell>
    );
}
