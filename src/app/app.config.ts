import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';

import { echarts } from '@/config/echarts.config';
import { routes } from './app.routes';
import { provideI18n } from '@/shared/core/provider/providei18n';
import { provideArcTech } from '@/shared/core/provider/providearctech';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideI18n(),
    provideArcTech(),
    provideEchartsCore({ echarts }),
  ],
};

// Made with Bob
