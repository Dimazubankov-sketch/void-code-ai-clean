import { useRef, useState } from 'react';
import { useLockBodyScroll } from '@/shared/lib/useLockBodyScroll';
import { SkillsPanel } from '@/features/skills/SkillsView';
import { AgentSkillsPanel } from '@/features/cockpit/AgentSkillsPanel';
import { Sheet, SheetWithBack, BigButton, RowButton, ConnectorPickerSheet } from '@/features/chat/ChatPlusMenu';
import { useFishVoices } from '@/shared/lib/useOpenAiTts';
import { Icons } from '@/shared/ui/Icons';

// ==========================================
// AgentPlusMenu — меню «+» в чате агента/оркестратора
// ==========================================
// Тот же каркас, что у ChatPlusMenu (переиспользует Sheet/BigButton/
// RowButton/ConnectorPickerSheet напрямую — второй реализации нет), но
// со своим набором пунктов: скиллы, скиллы АГЕНТА (отдельная сущность —
// см. AgentSkillsPanel.jsx), голос агента, коннекторы.
export function AgentPlusMenu({ state, updateState, agentId, onClose, onPickCamera, onPickPhoto, onPickFile }) {
    useLockBodyScroll();
    const [sub, setSub] = useState(null); // null | 'skills' | 'agentSkills' | 'voice' | 'connectors'

    if (sub === 'skills') {
        return (
            <SheetWithBack title="Скиллы" onBack={() => setSub(null)} onClose={onClose}>
                <SkillsPanel state={state} updateState={updateState} />
            </SheetWithBack>
        );
    }
    if (sub === 'agentSkills') {
        return (
            <SheetWithBack title="Инструкции" onBack={() => setSub(null)} onClose={onClose}>
                <p className="text-xs text-gray-400 mb-4 leading-relaxed">Эти инструкции применяются только к этому агенту — не путать с общими скиллами выше.</p>
                <AgentSkillsPanel state={state} updateState={updateState} agentId={agentId} />
            </SheetWithBack>
        );
    }
    if (sub === 'voice') {
        return <AgentVoiceSheet state={state} updateState={updateState} agentId={agentId} onBack={() => setSub(null)} onClose={onClose} />;
    }
    if (sub === 'connectors') {
        return <ConnectorPickerSheet state={state} updateState={updateState} onBack={() => setSub(null)} onClose={onClose} />;
    }

    return (
        <Sheet title="Добавить в чат" onClose={onClose}>
            <div className="grid grid-cols-3 gap-3 mb-3">
                <BigButton icon="Camera" label="Камера" onClick={() => onPickCamera?.()} />
                <BigButton icon="Image" label="Фото" onClick={() => onPickPhoto?.()} />
                <BigButton icon="PaperclipThin" label="Файлы" onClick={() => onPickFile?.()} />
            </div>

            {/* Каждый пункт — свой отдельный блок-«столбик», как и просили,
                а не один общий список: скиллы (общие) отделены от скиллов
                именно этого агента, голос и коннекторы — тоже сами по себе. */}
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden mb-3">
                <RowButton icon="Skills" label="Скиллы" chevron onClick={() => setSub('skills')} />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden mb-3">
                <RowButton icon="Instructions" label="Инструкции" chevron onClick={() => setSub('agentSkills')} />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden mb-3">
                <RowButton icon="Volume2" label="Голос" chevron onClick={() => setSub('voice')} />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl overflow-hidden">
                <RowButton icon="Plug" label="Коннекторы" chevron onClick={() => setSub('connectors')} />
            </div>
        </Sheet>
    );
}

// Выбор голоса конкретного агента — та же библиотека Fish, что и в
// основных голосовых настройках (второй системы голосов не заводим),
// но выбор хранится на самом агенте (agent.voicePresetFish), а не
// глобально — у разных агентов может звучать разный голос.
function AgentVoiceSheet({ state, updateState, agentId, onBack, onClose }) {
    const { voices, loading } = useFishVoices();
    const agent = (state.aiAgents || []).find((a) => a.id === agentId);
    const selected = agent?.voicePresetFish || voices[0]?.id || '';

    const choose = (id) => {
        updateState({ aiAgents: (state.aiAgents || []).map((a) => (a.id === agentId ? { ...a, voicePresetFish: id } : a)) });
    };

    return (
        <SheetWithBack title="Голос агента" onBack={onBack} onClose={onClose}>
            <div className="space-y-1.5">
                {loading && <p className="text-sm text-gray-400 text-center py-8">Загружаю голоса…</p>}
                {voices.map((v) => (
                    <button
                        key={v.id}
                        onClick={() => choose(v.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-colors ${selected === v.id ? 'bg-[#efecf9] dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                    >
                        <span className="min-w-0">
                            <span className="block font-bold text-sm dark:text-white truncate">{v.title}</span>
                            {v.description && <span className="block text-xs text-gray-400 truncate">{v.description}</span>}
                        </span>
                        {selected === v.id && <Icons.Check className="w-4 h-4 text-[#5b32d4] shrink-0" />}
                    </button>
                ))}
            </div>
        </SheetWithBack>
    );
}
