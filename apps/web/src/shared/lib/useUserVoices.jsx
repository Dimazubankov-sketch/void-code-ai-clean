import { useCallback, useEffect, useState } from 'react';
import { listUserVoices, deleteUserVoice } from '@/shared/api/voices';

// ==========================================
// useUserVoices — голоса, созданные самим пользователем
// ==========================================
// Подмешиваются к стандартным голосам Fish в один общий список («Мои
// голоса»). Хранится Fish voice ID, поэтому один и тот же голос работает
// и в обычной озвучке, и в Voice Mode — вторая система голосов не нужна.
//
// Модульный кэш: список меняется редко (только при создании/удалении),
// а запрашивается из нескольких экранов сразу.
let cache = null;
const subscribers = new Set();

function publish(next) {
    cache = next;
    subscribers.forEach((fn) => fn(next));
}

export function useUserVoices() {
    const [voices, setVoices] = useState(cache || []);
    const [loading, setLoading] = useState(cache === null);

    useEffect(() => {
        subscribers.add(setVoices);
        if (cache === null) {
            listUserVoices()
                .then((items) => publish(Array.isArray(items) ? items : []))
                .catch(() => publish([]))
                .finally(() => setLoading(false));
        }
        return () => { subscribers.delete(setVoices); };
    }, []);

    const add = useCallback((voice) => {
        publish([voice, ...(cache || [])]);
    }, []);

    const remove = useCallback(async (id) => {
        await deleteUserVoice(id);
        publish((cache || []).filter((v) => v.id !== id));
    }, []);

    // Принудительно перечитать (например, после входа другим аккаунтом).
    const refresh = useCallback(() => {
        listUserVoices().then((items) => publish(Array.isArray(items) ? items : [])).catch(() => { /* noop */ });
    }, []);

    return { voices, loading, add, remove, refresh };
}
