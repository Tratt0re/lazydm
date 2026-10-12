import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';

import { echarts } from '@/config/echarts.config';
import { routes } from './app.routes';
import { provideI18n } from '@/shared/core/provider/providei18n';
import { provideArcTech } from '@/shared/core/provider/providearctech';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Compendium system pages read their scope from route data set above them (inside the sheet).
    provideRouter(routes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideI18n(),
    provideArcTech(),
    provideEchartsCore({ echarts }),
  ],
};

// Made with Bob
