import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { TRACKER_ROW_DENSITIES, type TrackerRowDensity } from '@/config/local-preferences.config';
import { I18nService } from '@/services/i18n.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ShortcutsSheetService } from '@/services/shortcuts-sheet.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechSwitchComponent } from '@/shared/components/switch';
import { EDarkModes, ArcTechDarkMode } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-general-section',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechSwitchComponent,
    ...ArcTechSelectImports,
  ],
  templateUrl: './general-section.component.html',
})
export class GeneralSectionComponent {
  protected readonly darkMode = inject(ArcTechDarkMode);
  protected readonly i18nService = inject(I18nService);
  protected readonly shortcutsSheet = inject(ShortcutsSheetService);
  protected readonly themeOptions = [EDarkModes.SYSTEM, EDarkModes.LIGHT, EDarkModes.DARK] as const;
  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly selectedTheme = this.darkMode.currentTheme;
  protected readonly selectedLanguage = this.i18nService.language;
  private readonly localPreferences = inject(LocalPreferencesService);
  protected readonly showFileSizes = this.localPreferences.showFileSizes;
  protected readonly trackerRowDensity = this.localPreferences.trackerRowDensity;
  protected readonly trackerRowDensities = TRACKER_ROW_DENSITIES;

  protected setShowFileSizes(show: boolean): void {
    this.localPreferences.setShowFileSizes(show);
  }

  protected onTrackerRowDensityChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (TRACKER_ROW_DENSITIES.includes(selectedValue as TrackerRowDensity)) {
      this.localPreferences.setTrackerRowDensity(selectedValue as TrackerRowDensity);
    }
  }

  protected getLanguageLabelKey(language: string): string {
    return `header.language.options.${language}`;
  }

  protected themeOptionLabelKey(theme: EDarkModes): string {
    return `settings.general.cards.theme.options.${theme}`;
  }

  protected themeOptionIcon(theme: EDarkModes): 'monitor' | 'sun' | 'moon' {
    if (theme === EDarkModes.SYSTEM) {
      return 'monitor';
    }

    return theme === EDarkModes.DARK ? 'moon' : 'sun';
  }

  protected onThemeChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (
      selectedValue === EDarkModes.SYSTEM ||
      selectedValue === EDarkModes.LIGHT ||
      selectedValue === EDarkModes.DARK
    ) {
      applyThemeTransition(this.darkMode, {
        targetMode: selectedValue,
      });
    }
  }

  protected onLanguageChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (
      selectedValue &&
      this.languages.includes(selectedValue as (typeof this.languages)[number])
    ) {
      void this.i18nService.use(selectedValue);
    }
  }

  private asSingleValue(value: string | string[]): string | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
