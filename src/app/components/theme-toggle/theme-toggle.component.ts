import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { EDarkModes, ArcTechDarkMode } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-theme-toggle',
  imports: [ArcTechButtonComponent, ArcTechIconComponent, TranslatePipe],
  templateUrl: './theme-toggle.component.html',
})
export class ThemeToggleComponent {
  protected readonly EDarkModes = EDarkModes;
  protected readonly darkMode = inject(ArcTechDarkMode);

  protected getThemeToggleAriaLabelKey(): string {
    return this.darkMode.themeMode() === EDarkModes.DARK ? 'header.theme.activateLight' : 'header.theme.activateDark';
  }

  protected getThemeToggleTitleKey(): string {
    return this.darkMode.themeMode() === EDarkModes.DARK ? 'header.theme.lightMode' : 'header.theme.darkMode';
  }

  protected toggleTheme(event: MouseEvent): void {
    applyThemeTransition(this.darkMode, { origin: event });
  }
}
