import type { Route, Routes, UrlMatchResult, UrlSegment } from '@angular/router';

import { openInSheetGuard } from '@/guards/app-sheet.guard';
import { CAMPAIGN_SLUG_PARAM, campaignEntryGuard, campaignGuard } from '@/guards/campaign.guard';
import { documentLeaveGuard } from '@/guards/document-leave.guard';
import { setupEntryGuard } from '@/guards/setup.guard';
import { SYSTEM_SLUG_PARAM, systemGuard } from '@/guards/system.guard';
import { vaultGuard } from '@/guards/vault.guard';
import { RootLayout } from '@/layout/root-layout/root-layout';
import { APP_SHEET_OUTLET, APP_SHEET_TITLE_ROUTE_DATA } from '@/services/app-sheet.service';
import { NOTE_SCOPE_ROUTE_DATA } from '@/services/note-scope.service';
import { SPLIT_PANE_OUTLET } from '@/services/workspace.service';

/** Sections that were renamed: old URLs (saved tabs, links) open the new section. */
const RENAMED_SECTION_ROUTES: Routes = [
  { path: 'monsters', pathMatch: 'full', redirectTo: 'enemies' },
  { path: 'monsters/:note', redirectTo: 'enemies/:note' },
  { path: 'monsters/:subfolder/:note', redirectTo: 'enemies/:subfolder/:note' },
];

/** Image and sound file names: those open the asset page (image viewer / player), not a note. */
const ASSET_FILE_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif|mp3|wav|ogg|m4a|flac)$/i;

/** Encounter file names: those open the encounter page, not a note. */
const ENCOUNTER_FILE_PATTERN = /\.json$/i;

/** An image or a sound of a section, directly in it (`:file`) or in one of its sub-folders (`:subfolder/:file`). */
function matchImageAsset(segments: UrlSegment[]): UrlMatchResult | null {
  const file = segments[segments.length - 1];
  if ((segments.length !== 1 && segments.length !== 2) || !ASSET_FILE_PATTERN.test(file.path)) {
    return null;
  }

  return {
    consumed: segments,
    posParams: segments.length === 2 ? { subfolder: segments[0], file } : { file },
  };
}

/** An encounter file (`.json`), directly in a section (`:file`) or in one of its sub-folders. */
function matchEncounter(segments: UrlSegment[]): UrlMatchResult | null {
  const file = segments[segments.length - 1];
  if ((segments.length !== 1 && segments.length !== 2) || !ENCOUNTER_FILE_PATTERN.test(file.path)) {
    return null;
  }

  return {
    consumed: segments,
    posParams: segments.length === 2 ? { subfolder: segments[0], file } : { file },
  };
}

const MAPS_SECTION_PATH = 'maps';

/**
 * A map file (`.json`) of the Maps section, directly in it or in one of its sub-folders. Matched before
 * `:section` because a `.json` file elsewhere is an encounter; it supplies the same params as `:section`.
 */
function matchMap(segments: UrlSegment[]): UrlMatchResult | null {
  const file = segments[segments.length - 1];
  if (
    (segments.length !== 2 && segments.length !== 3) ||
    segments[0].path !== MAPS_SECTION_PATH ||
    !ENCOUNTER_FILE_PATTERN.test(file.path)
  ) {
    return null;
  }

  return {
    consumed: segments,
    posParams:
      segments.length === 3
        ? { section: segments[0], subfolder: segments[1], file }
        : { section: segments[0], file },
  };
}

const MAP_ROUTE: Route = {
  matcher: matchMap,
  loadComponent: () => import('./pages/map-page/map-page').then((m) => m.MapPage),
};

/**
 * A note: directly in its section (`:note`) or in one of its sub-folders (`:subfolder/:note`). Images at
 * those places open the asset page instead.
 */
const NOTE_ROUTES: Routes = [
  {
    matcher: matchImageAsset,
    loadComponent: () => import('./pages/asset-page/asset-page').then((m) => m.AssetPage),
  },
  {
    matcher: matchEncounter,
    loadComponent: () =>
      import('./pages/encounter-page/encounter-page').then((m) => m.EncounterPage),
  },
  ...[':note', ':subfolder/:note'].map((path) => ({
    path,
    canDeactivate: [documentLeaveGuard],
    loadComponent: () => import('./pages/document-page/document-page').then((m) => m.DocumentPage),
  })),
];

function matchSheetPaths(segments: UrlSegment[]): UrlMatchResult | null {
  return ['compendium', 'templates', 'battle-rules', 'settings'].includes(segments[0]?.path ?? '')
    ? { consumed: segments }
    : null;
}

/** The note pages of a compendium system, inside the Compendium sheet. */
const SYSTEM_SHEET_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/system-home-page/system-home-page').then((m) => m.SystemHomePage),
  },
  {
    path: 'review',
    loadComponent: () => import('./pages/review-page/review-page').then((m) => m.ReviewPage),
  },
  { path: 'broken-links', pathMatch: 'full', redirectTo: 'review' },
  ...RENAMED_SECTION_ROUTES,
  MAP_ROUTE,
  {
    path: ':section',
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/campaign-section-page/campaign-section-page').then(
            (m) => m.CampaignSectionPage,
          ),
      },
      ...NOTE_ROUTES,
    ],
  },
];

/**
 * The pages of a campaign. The first pane shows them in the main outlet, the second one in `split`; there the
 * campaign root has no entry redirect (that one jumps to the last active tab of the first pane).
 */
function campaignRoute(outlet?: string): Route {
  return {
    path: `campaigns/:${CAMPAIGN_SLUG_PARAM}`,
    ...(outlet ? { outlet } : {}),
    canActivate: [campaignGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: outlet ? [] : [campaignEntryGuard],
        loadComponent: () =>
          import('./pages/campaign-home-page/campaign-home-page').then((m) => m.CampaignHomePage),
      },
      {
        path: 'review',
        loadComponent: () => import('./pages/review-page/review-page').then((m) => m.ReviewPage),
      },
      { path: 'broken-links', pathMatch: 'full', redirectTo: 'review' },
      ...RENAMED_SECTION_ROUTES,
      MAP_ROUTE,
      {
        path: ':section',
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./pages/campaign-section-page/campaign-section-page').then(
                (m) => m.CampaignSectionPage,
              ),
          },
          ...NOTE_ROUTES,
        ],
      },
    ],
  };
}

export const routes: Routes = [
  {
    path: 'compendium',
    outlet: APP_SHEET_OUTLET,
    canMatch: [vaultGuard],
    data: { [APP_SHEET_TITLE_ROUTE_DATA]: 'compendium.list.title' },
    loadComponent: () => import('./layout/app-sheet/app-sheet').then((m) => m.AppSheet),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./layout/compendium-sheet-layout/compendium-sheet-layout').then(
            (m) => m.CompendiumSheetLayout,
          ),
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./pages/compendium-page/compendium-page').then((m) => m.CompendiumPage),
          },
          {
            path: `:${SYSTEM_SLUG_PARAM}`,
            canActivate: [systemGuard],
            data: { [NOTE_SCOPE_ROUTE_DATA]: 'system' },
            loadComponent: () =>
              import('./layout/system-sheet-layout/system-sheet-layout').then(
                (m) => m.SystemSheetLayout,
              ),
            children: SYSTEM_SHEET_ROUTES,
          },
        ],
      },
    ],
  },
  {
    path: 'templates',
    outlet: APP_SHEET_OUTLET,
    canMatch: [vaultGuard],
    data: { [APP_SHEET_TITLE_ROUTE_DATA]: 'nav.items.templates' },
    loadComponent: () => import('./layout/app-sheet/app-sheet').then((m) => m.AppSheet),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/template-library-page/template-library-page').then(
            (m) => m.TemplateLibraryPage,
          ),
      },
    ],
  },
  {
    path: 'battle-rules',
    outlet: APP_SHEET_OUTLET,
    canMatch: [vaultGuard],
    data: { [APP_SHEET_TITLE_ROUTE_DATA]: 'nav.items.battleRules' },
    loadComponent: () => import('./layout/app-sheet/app-sheet').then((m) => m.AppSheet),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/battle-rule-library-page/battle-rule-library-page').then(
            (m) => m.BattleRuleLibraryPage,
          ),
      },
    ],
  },
  {
    path: 'settings',
    outlet: APP_SHEET_OUTLET,
    canMatch: [vaultGuard],
    data: { [APP_SHEET_TITLE_ROUTE_DATA]: 'nav.items.settings' },
    loadComponent: () => import('./layout/app-sheet/app-sheet').then((m) => m.AppSheet),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'general' },
      {
        path: ':section',
        loadComponent: () =>
          import('./pages/settings-page/settings-page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup-layout/setup-layout').then((m) => m.SetupLayout),
    children: [
      { path: '', pathMatch: 'full', canActivate: [setupEntryGuard], children: [] },
      {
        path: 'welcome',
        data: { setupWide: true },
        loadComponent: () => import('./pages/welcome-page/welcome-page').then((m) => m.WelcomePage),
      },
      {
        path: 'vault',
        data: { setupWide: true },
        loadComponent: () =>
          import('./pages/vault-setup-page/vault-setup-page').then((m) => m.VaultSetupPage),
      },
    ],
  },
  {
    path: '',
    canMatch: [vaultGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'campaigns' },
      // Compendium, Templates and Settings links open in the full-page sheet over the current page.
      { matcher: matchSheetPaths, canActivate: [openInSheetGuard], children: [] },
      {
        path: 'campaigns',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/campaign-list-page/campaign-list-page').then((m) => m.CampaignListPage),
      },
      {
        path: '',
        component: RootLayout,
        // The same pages again for the second pane, which shows them in the `split` outlet.
        children: [campaignRoute(), campaignRoute(SPLIT_PANE_OUTLET)],
      },
      { path: '**', redirectTo: 'campaigns' },
    ],
  },
];
