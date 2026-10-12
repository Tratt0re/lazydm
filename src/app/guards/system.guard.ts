import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { CompendiumService } from '@/services/compendium.service';

export const SYSTEM_SLUG_PARAM = 'systemSlug';

/** Opens the compendium system named in the URL; unknown systems send the user back to the compendium. */
export const systemGuard: CanActivateFn = async (route) => {
  const compendiumService = inject(CompendiumService);
  const router = inject(Router);
  const slug = route.paramMap.get(SYSTEM_SLUG_PARAM) ?? '';

  const system = await compendiumService.activate(slug);
  return system ? true : router.createUrlTree(['/compendium']);
};
