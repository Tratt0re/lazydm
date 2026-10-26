import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { CampaignService } from '@/services/campaign.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { VaultService } from '@/services/vault.service';

/** Only the first navigation of a launch may open the last campaign: a later return to `/` shows the list. */
let hasLaunched = false;

/**
 * The root at launch: with *Open the last campaign at start* on, the campaign opened last on this vault (its tabs
 * and split come back through its entry guard). Anything else, a missing or deleted campaign included, is the list.
 */
export const launchGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const preferences = inject(LocalPreferencesService);
  const vaultService = inject(VaultService);
  const campaignService = inject(CampaignService);

  const listUrl = router.createUrlTree(['/campaigns']);
  if (hasLaunched) {
    return listUrl;
  }

  hasLaunched = true;
  if (!preferences.getOpenLastCampaign()) {
    return listUrl;
  }

  const vaultId = vaultService.currentVault()?.id ?? null;
  const slug = vaultId ? preferences.getLastCampaign(vaultId) : null;
  if (!slug) {
    return listUrl;
  }

  const campaign = await campaignService.activate(slug);
  return campaign ? router.createUrlTree(['/campaigns', slug]) : listUrl;
};
