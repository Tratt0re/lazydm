import { Routes } from '@angular/router';

import { vaultGuard } from '@/guards/vault.guard';
import { RootLayout } from '@/layout/root-layout/root-layout';

export const routes: Routes = [
  {
    path: 'setup',
    loadComponent: () => import('./pages/vault-setup-page/vault-setup-page').then((m) => m.VaultSetupPage),
  },
  {
    path: '',
    component: RootLayout,
    canMatch: [vaultGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/home-page/home-page').then((m) => m.HomePage),
      },
      {
        path: 'campaigns',
        loadComponent: () => import('./pages/campaigns-page/campaigns-page').then((m) => m.CampaignsPage),
      },
      {
        path: 'characters',
        loadComponent: () => import('./pages/characters-page/characters-page').then((m) => m.CharactersPage),
      },
      {
        path: 'encounters',
        loadComponent: () => import('./pages/encounters-page/encounters-page').then((m) => m.EncountersPage),
      },
      { path: 'settings', pathMatch: 'full', redirectTo: 'settings/general' },
      {
        path: 'settings/:section',
        loadComponent: () => import('./pages/settings-page/settings-page').then((m) => m.SettingsPage),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
