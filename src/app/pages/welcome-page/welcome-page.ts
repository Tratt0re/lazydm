import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { I18nService } from '@/services/i18n.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechDarkMode, EDarkModes } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

interface WelcomePoint {
  readonly key: 'prepare' | 'session' | 'files';
  readonly icon: ArcTechIcon;
  /** The promise a DM cares about most: the card is emphasised. */
  readonly isMain: boolean;
}

/** First step of the setup flow: what LazyDM is for, and the language and theme of this device. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-welcome-page',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent, ...ArcTechSelectImports],
  templateUrl: './welcome-page.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class WelcomePage implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly darkMode = inject(ArcTechDarkMode);
  private readonly i18nService = inject(I18nService);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  protected readonly points: readonly WelcomePoint[] = [
    { key: 'prepare', icon: 'clapperboard', isMain: false },
    { key: 'session', icon: 'swords', isMain: true },
    { key: 'files', icon: 'folder', isMain: false },
  ];
  protected readonly themeOptions = [EDarkModes.SYSTEM, EDarkModes.LIGHT, EDarkModes.DARK] as const;
  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly selectedTheme = this.darkMode.currentTheme;
  protected readonly selectedLanguage = this.i18nService.language;

  ngAfterViewInit(): void {
    this.title().nativeElement.focus();
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
      applyThemeTransition(this.darkMode, { targetMode: selectedValue });
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

  protected next(): void {
    void this.router.navigate(['/setup', 'vault']);
  }

  private asSingleValue(value: string | string[]): string | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
