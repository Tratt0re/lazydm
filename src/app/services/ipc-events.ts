import { DestroyRef, inject } from '@angular/core';

/** Pushed by the main process whenever the vault index changed (a save, a move, an external edit). */
export const INDEX_UPDATED_EVENT = 'index:updated';

/**
 * Listens to a push event of the main process until the calling component or service is destroyed.
 * Must be called in an injection context (a constructor or field initialiser).
 */
export function listenToIpcEvent(channel: string, listener: (payload: unknown) => void): void {
  window.electronAPI?.onIpcEvent?.(channel, listener);
  inject(DestroyRef).onDestroy(() => window.electronAPI?.offIpcEvent?.(channel, listener));
}

/** Runs `listener` whenever the vault index changed. */
export function onIndexUpdated(listener: () => void): void {
  listenToIpcEvent(INDEX_UPDATED_EVENT, listener);
}
