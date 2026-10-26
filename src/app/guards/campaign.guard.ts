import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { CampaignService } from '@/services/campaign.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { VaultService } from '@/services/vault.service';
import { WorkspaceService } from '@/services/workspace.service';

export const CAMPAIGN_SLUG_PARAM = 'campaignSlug';

/** Opens the campaign named in the URL; unknown campaigns send the user back to the campaign list. */
export const campaignGuard: CanActivateFn = async (route) => {
  const campaignService = inject(CampaignService);
  const router = inject(Router);
  const slug = route.paramMap.get(CAMPAIGN_SLUG_PARAM) ?? '';

  const vaultService = inject(VaultService);
  const preferences = inject(LocalPreferencesService);

  const campaign = await campaignService.activate(slug);
  if (campaign) {
    // The campaign opened last on this vault, for the launch redirect (see launchGuard).
    const vaultId = vaultService.currentVault()?.id ?? null;
    if (vaultId) {
      preferences.setLastCampaign(vaultId, slug);
    }
    return true;
  }

  return router.createUrlTree(['/campaigns']);
};

/** The campaign root, entered from outside the campaign: straight to the last active tab (no Overview flash). */
export const campaignEntryGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const workspace = inject(WorkspaceService);
  const slug = route.parent?.paramMap.get(CAMPAIGN_SLUG_PARAM) ?? '';
  const url = await workspace.getEntryUrl(slug);
  return url ? router.parseUrl(url) : true;
};
