import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';

import { VaultService } from '@/services/vault.service';

/** Lets the app shell match only when a vault is open; otherwise sends the user to the vault setup page. */
export const vaultGuard: CanMatchFn = async () => {
  const vaultService = inject(VaultService);
  const router = inject(Router);

  try {
    const state = vaultService.state() ?? (await vaultService.loadCurrent());
    return state.status === 'ready' ? true : router.createUrlTree(['/setup']);
  } catch (error) {
    console.warn('[app] Failed to load the current vault:', error);
    return router.createUrlTree(['/setup']);
  }
};
