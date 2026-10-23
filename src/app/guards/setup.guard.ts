import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { LocalPreferencesService } from '@/services/local-preferences.service';
import { VaultService } from '@/services/vault.service';

/**
 * Entry of the setup flow: the welcome step on a first start, the vault step when the vault is missing or the
 * welcome was already seen (the vault was closed, or this device was set up before).
 */
export const setupEntryGuard: CanActivateFn = async () => {
  const vaultService = inject(VaultService);
  const router = inject(Router);
  const preferences = inject(LocalPreferencesService);

  try {
    const state = vaultService.state() ?? (await vaultService.loadCurrent());
    if (state.status === 'missing') {
      return router.createUrlTree(['/setup', 'vault']);
    }
  } catch (error) {
    console.warn('[app] Failed to load the current vault:', error);
  }

  return router.createUrlTree(['/setup', preferences.getOnboardingCompleted() ? 'vault' : 'welcome']);
};
