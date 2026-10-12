import { Routes } from '@angular/router';

import { CAMPAIGN_SLUG_PARAM, campaignGuard } from '@/guards/campaign.guard';
import { documentLeaveGuard } from '@/guards/document-leave.guard';
import { SYSTEM_SLUG_PARAM, systemGuard } from '@/guards/system.guard';
import { vaultGuard } from '@/guards/vault.guard';
import { RootLayout } from '@/layout/root-layout/root-layout';
import { NOTE_SCOPE_ROUTE_DATA } from '@/services/note-scope.service';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () => import('./pages/vault-setup-page/vault-setup-page').then((m) => m.VaultSetupPage),
  },
  {
    path: '',
    canMatch: [vaultGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'campaigns' },
      {
        path: 'campaigns',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/campaign-list-page/campaign-list-page').then((m) => m.CampaignListPage),
      },
      {
        path: 'compendium',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/compendium-page/compendium-page').then((m) => m.CompendiumPage),
      },
      {
        path: '',
        component: RootLayout,
        children: [
          {
            path: `compendium/:${SYSTEM_SLUG_PARAM}`,
            canActivate: [systemGuard],
            data: { [NOTE_SCOPE_ROUTE_DATA]: 'system' },
            children: [
              {
                path: '',
                pathMatch: 'full',
                loadComponent: () =>
                  import('./pages/system-home-page/system-home-page').then((m) => m.SystemHomePage),
              },
              {
                path: 'broken-links',
                loadComponent: () =>
                  import('./pages/broken-links-page/broken-links-page').then((m) => m.BrokenLinksPage),
              },
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
                  {
                    path: ':note',
                    canDeactivate: [documentLeaveGuard],
                    loadComponent: () =>
                      import('./pages/document-page/document-page').then((m) => m.DocumentPage),
                  },
                ],
              },
            ],
          },
          {
            path: `campaigns/:${CAMPAIGN_SLUG_PARAM}`,
            canActivate: [campaignGuard],
            children: [
              {
                path: '',
                pathMatch: 'full',
                loadComponent: () =>
                  import('./pages/campaign-home-page/campaign-home-page').then((m) => m.CampaignHomePage),
              },
              {
                path: 'broken-links',
                loadComponent: () =>
                  import('./pages/broken-links-page/broken-links-page').then((m) => m.BrokenLinksPage),
              },
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
                  {
                    path: ':note',
                    canDeactivate: [documentLeaveGuard],
                    loadComponent: () =>
                      import('./pages/document-page/document-page').then((m) => m.DocumentPage),
                  },
                ],
              },
            ],
          },
          { path: 'settings', pathMatch: 'full', redirectTo: 'settings/general' },
          {
            path: 'settings/:section',
            loadComponent: () => import('./pages/settings-page/settings-page').then((m) => m.SettingsPage),
          },
        ],
      },
      { path: '**', redirectTo: 'campaigns' },
    ],
  },
];
