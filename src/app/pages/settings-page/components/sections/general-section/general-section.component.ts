import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { I18nService } from '@/services/i18n.service';
import { ZardSelectImports } from '@/shared/components/select';
import { EDarkModes, ZardDarkMode } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

@Component({
  selector: 'app-general-section',
  imports: [TranslatePipe, ...ZardSelectImports],
  templateUrl: './general-section.component.html',
})
export class GeneralSectionComponent {
  protected readonly darkMode = inject(ZardDarkMode);
  protected readonly i18nService = inject(I18nService);
  protected readonly themeOptions = [EDarkModes.SYSTEM, EDarkModes.LIGHT, EDarkModes.DARK] as const;
  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly selectedTheme = this.darkMode.currentTheme;
  protected readonly selectedLanguage = this.i18nService.language;

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
    if (selectedValue === EDarkModes.SYSTEM || selectedValue === EDarkModes.LIGHT || selectedValue === EDarkModes.DARK) {
      applyThemeTransition(this.darkMode, {
        targetMode: selectedValue,
      });
    }
  }

  protected onLanguageChange(value: string | string[]): void {
    const selectedValue = this.asSingleValue(value);
    if (selectedValue && this.languages.includes(selectedValue as (typeof this.languages)[number])) {
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
