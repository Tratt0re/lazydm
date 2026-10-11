import { Routes } from '@angular/router';

import { CAMPAIGN_SLUG_PARAM, campaignGuard } from '@/guards/campaign.guard';
import { vaultGuard } from '@/guards/vault.guard';
import { RootLayout } from '@/layout/root-layout/root-layout';

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
        path: '',
        component: RootLayout,
        children: [
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
                path: ':section',
                loadComponent: () =>
                  import('./pages/campaign-section-page/campaign-section-page').then(
                    (m) => m.CampaignSectionPage,
                  ),
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
