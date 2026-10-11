import { makeEnvironmentProviders, type EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { EVENT_MANAGER_PLUGINS } from '@angular/platform-browser';

import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ArcTechDebounceEventManagerPlugin } from './event-manager-plugins/arctech-debounce-event-manager-plugin';
import { ArcTechEventManagerPlugin } from './event-manager-plugins/arctech-event-manager-plugin';
import { ArcTechDarkMode } from '../../services/dark-mode';

export function provideArcTech(): EnvironmentProviders {
  const eventManagerPlugins = [
    {
      provide: EVENT_MANAGER_PLUGINS,
      useClass: ArcTechEventManagerPlugin,
      multi: true,
    },
    {
      provide: EVENT_MANAGER_PLUGINS,
      useClass: ArcTechDebounceEventManagerPlugin,
      multi: true,
    },
  ];

  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const localPreferencesService = inject(LocalPreferencesService);
      const darkModeService = inject(ArcTechDarkMode);

      try {
        localPreferencesService.init();
      } catch (error) {
        console.warn('[app] Failed to initialize local preferences:', error);
      }

      darkModeService.init();
    }),
    ...eventManagerPlugins,
  ]);
}
