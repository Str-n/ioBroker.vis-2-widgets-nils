import { useSyncExternalStore } from 'react';
import { isSmartHomeThemeId, type SmartHomeThemeId } from './presets';

export const THEME_STORAGE_KEY = 'vis-2-widgets-nils-fork.theme';
const CHANGE_EVENT = 'nils-smarthome-theme-change';
const ATTRIBUTE = 'data-sh-theme';

function readStoredTheme(): SmartHomeThemeId {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return isSmartHomeThemeId(stored) ? stored : 'ocean';
    } catch {
        // Private/locked-down browsers can still change themes for this page.
        return 'ocean';
    }
}

// Restore before the first widget paints, even if the selector is on another view.
if (typeof document !== 'undefined' && !document.documentElement.hasAttribute(ATTRIBUTE)) {
    document.documentElement.setAttribute(ATTRIBUTE, readStoredTheme());
}

export function getSelectedTheme(): SmartHomeThemeId {
    const value = typeof document !== 'undefined' ? document.documentElement.getAttribute(ATTRIBUTE) : null;
    return isSmartHomeThemeId(value) ? value : 'ocean';
}

function applyTheme(id: SmartHomeThemeId): void {
    document.documentElement.setAttribute(ATTRIBUTE, id);
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function selectSmartHomeTheme(id: SmartHomeThemeId): void {
    if (!isSmartHomeThemeId(id)) {
        return;
    }
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
        // Keep the selector functional when persistent storage is unavailable.
    }
    applyTheme(id);
}

const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach(listener => listener());
const onStorage = (event: StorageEvent): void => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyTheme(readStoredTheme());
    }
};

function subscribe(listener: () => void): () => void {
    if (!listeners.size) {
        window.addEventListener(CHANGE_EVENT, notify);
        window.addEventListener('storage', onStorage);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size) {
            window.removeEventListener(CHANGE_EVENT, notify);
            window.removeEventListener('storage', onStorage);
        }
    };
}

export function useSelectedTheme(): SmartHomeThemeId {
    return useSyncExternalStore(subscribe, getSelectedTheme, () => 'ocean');
}
