import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { VaultInspectionDto, VaultStateDto } from '@/dtos';
import { I18nService } from '@/services/i18n.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechDarkMode, EDarkModes } from '@/shared/services/dark-mode';
import { applyThemeTransition } from '@/shared/utils/theme-transition';

type VaultFolderDetection = 'existing' | 'empty' | 'nonEmpty';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vault-setup-page',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechBadgeComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechSelectImports,
  ],
  templateUrl: './vault-setup-page.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class VaultSetupPage implements OnInit, AfterViewInit {
  private readonly vaultService = inject(VaultService);
  private readonly router = inject(Router);
  private readonly preferences = inject(LocalPreferencesService);
  private readonly darkMode = inject(ArcTechDarkMode);
  private readonly i18nService = inject(I18nService);

  // Language and theme of this device, in the footer like on the Welcome step.
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
    const selected = Array.isArray(value) ? value[0] : value;
    if (selected === EDarkModes.SYSTEM || selected === EDarkModes.LIGHT || selected === EDarkModes.DARK) {
      applyThemeTransition(this.darkMode, { targetMode: selected });
    }
  }

  protected onLanguageChange(value: string | string[]): void {
    const selected = Array.isArray(value) ? value[0] : value;
    if (selected && this.languages.includes(selected as (typeof this.languages)[number])) {
      void this.i18nService.use(selected);
    }
  }
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  protected readonly isDesktop = this.vaultService.isAvailable;
  protected readonly inspection = signal<VaultInspectionDto | null>(null);
  protected readonly isBusy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly missingVault = computed(() => {
    const state = this.vaultService.state();
    return state?.status === 'missing' ? state.vault : null;
  });
  protected readonly canOpen = computed(() => {
    const inspection = this.inspection();
    return inspection !== null && inspection.isWritable && !this.isBusy();
  });
  protected readonly detection = computed<VaultFolderDetection | null>(() => {
    const inspection = this.inspection();
    if (!inspection) {
      return null;
    }

    if (inspection.isVault) {
      return 'existing';
    }

    return inspection.isEmpty ? 'empty' : 'nonEmpty';
  });

  /** Cloud drive of the chosen folder (`icloud`, `dropbox`…), null when it is only on this device. */
  protected readonly cloudProvider = computed(() => this.inspection()?.cloudProvider ?? null);
  /** Back to the welcome step, unless the vault is missing (the welcome has nothing to say then). */
  protected readonly canGoBack = computed(() => this.missingVault() === null);

  ngAfterViewInit(): void {
    this.title().nativeElement.focus();
  }

  ngOnInit(): void {
    if (this.isDesktop && !this.vaultService.state()) {
      void this.runTask(() => this.vaultService.loadCurrent());
    }
  }

  protected chooseFolder(): void {
    void this.runTask(async () => {
      const selection = await this.vaultService.selectFolder();
      if (!selection) {
        return;
      }

      this.inspection.set(await this.vaultService.inspect(selection.folderPath));
    });
  }

  protected openVault(): void {
    const inspection = this.inspection();
    if (!inspection) {
      return;
    }

    void this.runTask(async () => {
      await this.navigateWhenReady(await this.vaultService.open(inspection.folderPath));
    });
  }

  protected goBack(): void {
    void this.router.navigate(['/setup', 'welcome']);
  }

  protected retry(): void {
    void this.runTask(async () => {
      await this.navigateWhenReady(await this.vaultService.loadCurrent());
    });
  }

  private async navigateWhenReady(state: VaultStateDto): Promise<void> {
    if (state.status === 'ready') {
      this.preferences.setOnboardingCompleted(true);
      await this.router.navigateByUrl('/');
    }
  }

  private async runTask(task: () => Promise<unknown>): Promise<void> {
    this.isBusy.set(true);
    this.errorMessage.set(null);

    try {
      await task();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.isBusy.set(false);
    }
  }
}
