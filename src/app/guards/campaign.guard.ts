import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { CampaignService } from '@/services/campaign.service';

export const CAMPAIGN_SLUG_PARAM = 'campaignSlug';

/** Opens the campaign named in the URL; unknown campaigns send the user back to the campaign list. */
export const campaignGuard: CanActivateFn = async (route) => {
  const campaignService = inject(CampaignService);
  const router = inject(Router);
  const slug = route.paramMap.get(CAMPAIGN_SLUG_PARAM) ?? '';

  const campaign = await campaignService.activate(slug);
  return campaign ? true : router.createUrlTree(['/campaigns']);
};
