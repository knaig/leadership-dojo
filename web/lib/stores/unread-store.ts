'use client';

import { useSyncExternalStore, useCallback } from 'react';

let unreadCount = 0;
const listeners = new Set<() => void>();

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}

export function incrementUnread() {
    unreadCount++;
    emitChange();
}

export function clearUnread() {
    unreadCount = 0;
    emitChange();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot() {
    return unreadCount;
}

function getServerSnapshot() {
    return 0;
}

export function useUnreadStore() {
    const count = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const clear = useCallback(() => clearUnread(), []);
    return { unreadCount: count, clearUnread: clear };
}
