import { useRef, useState } from 'react';
import { useStaggerIn } from '@/shared/lib/useEnterAnimation';
import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { PLUGIN_TOOLS } from '@/features/plugins/PluginsView';
import { SkillsPanel } from '@/features/skills/SkillsView';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// ChatPlusMenu — меню по кнопке «+» в поле ввода чата
// ==========================================
// Структура (как в макете):
//  • три большие кнопки сверху: Камера, Фото, Файлы;
//  • отдельный блок с одной кнопкой «Добавить в проект»;
//  • отдельный блок «Создать изображение»;
//  • отдельный блок с двумя кнопками: «Агенты» и «Коннекторы».
// Часть пунктов открывает вложенные окна (проект / агенты / коннекторы)
// прямо поверх меню. Выбор изображения/агента включает соответствующий
// режим поля ввода (иконка + крестик), с которым дальше работает чат.

export function ChatPlusMenu({
    state,
    updateState,
    onClose,
    onPickCamera,
    onPickPhoto,
    onPickFile,
    onEnableImage,
    onPickAgent,
}) {
    useLockBodyScroll();
    const [sub, setSub] = useState(null); // null | 'project' | 'agents' | 'connectors'

    if (sub === 'project') return <ProjectPickerSheet state={state} updateState={updateState} onBack={() => setSub(null)} onClose={onClose} />;
    if (sub === 'agents') return <AgentPickerSheet state={state} updateState={updateState} onBack={() => setSub(null)} onClose={onClose} onPickAgent={onPickAgent} />;
    if (sub === 'connectors') return <ConnectorPickerSheet state={state} updateState={updateState} onBack={() => setSub(null)} onClose={onClose} />;
    if (sub === 'skills') return <SkillsSheet state={state} updateState={updateState} onBack={() => setSub(null)} onClose={onClose} />;

    return (
        <Sheet title="Добавить в чат" onClose={onClose}>
            {/* Три большие кнопки — Камера/Фото/Файлы (снова по просьбе
                пользователя, вернули прежний вид). Каждая кнопка СРАЗУ
                (в один клик) открывает нужный системный пикер — без
                какого-либо промежуточного экрана выбора: Камера открывает
                камеру устройства (capture="environment" на инпуте), Фото —
                галерею (accept="image/*"), Файлы — обычный проводник. */}
            <div className="grid grid-cols-3 gap-3 mb-3">
                <BigButton icon="Camera" label="Камера" onClick={() => { onPickCamera?.(); onClose(); }} />
                <BigButton icon="Image" label="Фото" onClick={() => { onPickPhoto?.(); onClose(); }} />
                <BigButton icon="PaperclipThin" label="Файлы" onClick={() => { onPickFile?.(); onClose(); }} />
            </div>

            {/* Блок: добавить в проект + скиллы (строго под проектом) */}
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden mb-3 divide-y divide-gray-100 dark:divide-gray-700/50">
                <RowButton icon="Folder" label="Добавить в проект" chevron onClick={() => setSub('project')} />
                <RowButton icon="Skills" label="Скиллы" chevron onClick={() => setSub('skills')} />
            </div>

            {/* Блок: создать изображение */}
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden mb-3">
                <RowButton icon="Image" label="Создать изображение" onClick={() => { onEnableImage?.(); onClose(); }} />
            </div>

            {/* Блок: агенты и коннекторы */}
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                <RowButton icon="Robot" label="Агенты" chevron onClick={() => setSub('agents')} />
                <RowButton icon="Plug" label="Коннекторы" chevron onClick={() => setSub('connectors')} />
            </div>
        </Sheet>
    );
}

// --- Общая «шторка» снизу (на ПК — по центру) ---
function Sheet({ title, onClose, children }) {
    return (
        <div data-modal-overlay className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 fade-in" onClick={onClose}>
            <div className="w-full sm:max-w-md bg-white dark:bg-darkCard rounded-t-3xl sm:rounded-3xl shadow-2xl slide-in-up max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><Icons.X className="w-4 h-4" /></button>
                    <h3 className="font-extrabold text-base dark:text-white">{title}</h3>
                    <div className="w-8" />
                </div>
                <div className="px-4 pb-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
}

// Большая квадратная кнопка (иконка сверху + подпись снизу, без круглой
// подложки под иконкой — по референсу пользователя) — используется для
// Камера/Фото/Файлы в верхней части меню «+».
function BigButton({ icon, label, onClick }) {
    const Icon = Icons[icon] || Icons.Plus;
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-2.5 aspect-square rounded-3xl bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 active:scale-[0.97] transition-all"
        >
            <Icon className="w-7 h-7 text-gray-800 dark:text-gray-200" />
            <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{label}</span>
        </button>
    );
}

function RowButton({ icon, label, onClick, chevron = false, right = null }) {
    const Icon = Icons[icon] || Icons.Plus;
    return (
        <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 transition-colors">
            <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300 shrink-0" />
            <span className="flex-1 text-left text-[15px] font-semibold text-gray-800 dark:text-gray-100">{label}</span>
            {right}
            {chevron && <Icons.ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
        </button>
    );
}

// --- Вложенное окно: выбор проекта ---
function ProjectPickerSheet({ state, updateState, onBack, onClose }) {
    const projects = state.projects || [];
    const chatId = state.activeChatId;
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');

    const inProject = (p) => (p.chatIds || []).includes(chatId);
    const toggle = (p) => {
        updateState({
            projects: projects.map(x => x.id === p.id
                ? { ...x, chatIds: inProject(x) ? x.chatIds.filter(c => c !== chatId) : [...(x.chatIds || []), chatId] }
                : x),
        });
    };
    const create = () => {
        const n = name.trim();
        if (!n) return;
        const proj = { id: 'proj_' + Date.now(), name: n, chatIds: chatId ? [chatId] : [], createdAt: Date.now() };
        updateState({ projects: [proj, ...projects] });
        setName(''); setCreating(false);
    };

    return (
        <SheetWithBack title="Добавить в проект" onBack={onBack} onClose={onClose}>
            {projects.length === 0 && !creating && (
                <p className="text-center text-sm text-gray-400 py-8">У вас пока нет проектов. Создайте первый.</p>
            )}
            <div className="space-y-2 mb-3">
                {projects.map(p => (
                    <button key={p.id} onClick={() => toggle(p)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <Icons.Folder className="w-5 h-5 text-[#5b32d4] shrink-0" />
                        <span className="flex-1 text-left text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
                        {inProject(p)
                            ? <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400"><Icons.Check className="w-3.5 h-3.5" /> В проекте</span>
                            : <Icons.Plus className="w-4 h-4 text-gray-400" />}
                    </button>
                ))}
            </div>
            {creating ? (
                <div className="flex gap-2">
                    <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }} placeholder="Название проекта" className="flex-1 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-darkBorder text-sm dark:text-white focus:outline-none focus:border-[#5b32d4]" />
                    <button onClick={create} disabled={!name.trim()} className="px-4 rounded-2xl bg-[#5b32d4] hover:bg-[#4a26b0] disabled:bg-gray-200 dark:disabled:bg-gray-800 text-white font-bold text-sm transition-colors">ОК</button>
                </div>
            ) : (
                <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-[#5b32d4] dark:text-purple-400 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <Icons.Plus className="w-4 h-4" /> Создать новый проект
                </button>
            )}
        </SheetWithBack>
    );
}

// --- Вложенное окно: выбор агента (без оркестраторов) ---
function AgentPickerSheet({ state, updateState, onBack, onClose, onPickAgent }) {
    const agents = (state.aiAgents || []).filter(a => a.kind !== 'orchestrator' && !(a.isGift && !a.claimed));

    return (
        <SheetWithBack title="Агенты" onBack={onBack} onClose={onClose}>
            {agents.length === 0 ? (
                <div className="text-center py-10">
                    <Icons.Robot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-400">У вас пока нет агентов. Их можно купить в магазине агентов.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {agents.map(a => {
                        const busy = !!a.currentTask;
                        return (
                            <button key={a.id} disabled={busy} onClick={() => { onPickAgent?.(a); onClose(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${busy ? 'bg-gray-50 dark:bg-gray-800/40 opacity-50 cursor-not-allowed' : 'bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: (a.color || '#5b32d4') + '22', color: a.color || '#5b32d4' }}>
                                    <Icons.Robot className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <p className="font-bold text-sm dark:text-white truncate">{a.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{busy ? 'Занят задачей' : 'Свободен'}</p>
                                </div>
                                {!busy && <Icons.Plus className="w-4 h-4 text-gray-400" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </SheetWithBack>
    );
}

// --- Вложенное окно: коннекторы (с поиском и фуллскрин-режимом) ---
function ConnectorPickerSheet({ state, updateState, onBack, onClose }) {
    const connected = state.connectedPlugins || [];
    const [query, setQuery] = useState('');
    const [fullscreen, setFullscreen] = useState(false);
    const scope = useStaggerIn('.cpm-conn', [query]);
    const connect = (tool) => {
        if (connected.includes(tool.id)) return;
        updateState({ connectedPlugins: [...connected, tool.id] });
    };
    const visible = PLUGIN_TOOLS.filter(tt => query.trim() === '' || tt.name.toLowerCase().includes(query.trim().toLowerCase()));

    return (
        <SheetWithBack
            title="Коннекторы"
            onBack={onBack}
            onClose={onClose}
            fullscreen={fullscreen}
            headerRight={
                <button onClick={() => setFullscreen(f => !f)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title={fullscreen ? 'Свернуть' : 'Развернуть'}>
                    {fullscreen ? <Icons.Minimize className="w-4 h-4" /> : <Icons.Maximize className="w-4 h-4" />}
                </button>
            }
        >
            {/* Поиск по названию коннектора */}
            <div className="relative mb-3">
                <Icons.Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Поиск коннектора…"
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-darkBorder rounded-xl text-sm dark:text-white outline-none focus:border-[#5b32d4] transition-colors"
                />
            </div>
            <div ref={scope} className="space-y-2">
                {visible.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Ничего не найдено</p>}
                {visible.map(tool => {
                    const Icon = Icons[tool.icon] || Icons.Plug;
                    const on = connected.includes(tool.id);
                    return (
                        <div key={tool.id} className="cpm-conn flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800/40">
                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm dark:text-white truncate">{tool.name}</p>
                                <p className="text-xs text-gray-400 truncate">{tool.desc}</p>
                            </div>
                            <button onClick={() => connect(tool)} className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${on ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-[#efecf9] dark:bg-purple-900/20 text-[#5b32d4] dark:text-purple-400 hover:bg-[#e0dbf4]'}`}>
                                {on ? '✓ Готово' : 'Привязать'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </SheetWithBack>
    );
}

// --- Вложенное окно: скиллы (та же панель, что и во вкладке Скиллы) ---
function SkillsSheet({ state, updateState, onBack, onClose }) {
    return (
        <SheetWithBack title="Скиллы" onBack={onBack} onClose={onClose}>
            <SkillsPanel state={state} updateState={updateState} />
        </SheetWithBack>
    );
}

// «Шторка» с кнопкой назад. fullscreen — окно на весь экран (для коннекторов).
function SheetWithBack({ title, onBack, onClose, children, fullscreen = false, headerRight = null }) {
    const panelClass = fullscreen
        ? 'w-full h-full sm:rounded-none'
        : 'w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh]';
    return (
        <div data-modal-overlay className={`fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center ${fullscreen ? 'p-0' : 'p-0 sm:p-4'} fade-in`} onClick={onClose}>
            <div className={`bg-white dark:bg-darkCard shadow-2xl slide-in-up flex flex-col ${panelClass}`} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-4 py-4 shrink-0">
                    <button onClick={onBack} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><Icons.ChevronLeft className="w-4 h-4" /></button>
                    <h3 className="flex-1 font-extrabold text-base dark:text-white">{title}</h3>
                    {headerRight}
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><Icons.X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 pb-6 overflow-y-auto flex-1">{children}</div>
            </div>
        </div>
    );
}
