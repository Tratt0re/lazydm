import { DestroyRef, inject } from '@angular/core';

/** Pushed by the main process whenever the vault index changed (a save, a move, an external edit). */
export const INDEX_UPDATED_EVENT = 'index:updated';

/** Pushed when `.lazydm/vault.json` changed (sections, templates, battle rules), by the app, an agent or sync. */
export const VAULT_CONFIG_CHANGED_EVENT = 'vault:configChanged';

/**
 * Listens to a push event of the main process until the calling component or service is destroyed.
 * Must be called in an injection context (a constructor or field initialiser).
 */
export function listenToIpcEvent(channel: string, listener: (payload: unknown) => void): void {
  window.electronAPI?.onIpcEvent?.(channel, listener);
  inject(DestroyRef).onDestroy(() => window.electronAPI?.offIpcEvent?.(channel, listener));
}

/** Runs `listener` whenever the vault index changed; it gets the vault paths that changed. */
export function onIndexUpdated(listener: (paths: readonly string[]) => void): void {
  listenToIpcEvent(INDEX_UPDATED_EVENT, (payload) =>
    listener((payload as { paths?: readonly string[] } | null)?.paths ?? []),
  );
}

/** Runs `listener` whenever the vault config (sections, template and battle rule choices) changed. */
export function onVaultConfigChanged(listener: () => void): void {
  listenToIpcEvent(VAULT_CONFIG_CHANGED_EVENT, listener);
}
