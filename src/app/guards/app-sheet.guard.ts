import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';

import { AppSheetService } from '@/services/app-sheet.service';

/** `/compendium/...`, `/templates` and `/settings/...` are not pages of their own: they open in the full-page sheet. */
export const openInSheetGuard: CanActivateFn = (_route, state) =>
  inject(AppSheetService).toSheetUrl(state.url);
