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
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';

type VaultFolderDetection = 'existing' | 'empty' | 'nonEmpty';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vault-setup-page',
  imports: [TranslatePipe, ArcTechAlertComponent, ArcTechBadgeComponent, ArcTechButtonComponent, ArcTechIconComponent],
  templateUrl: './vault-setup-page.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class VaultSetupPage implements OnInit, AfterViewInit {
  private readonly vaultService = inject(VaultService);
  private readonly router = inject(Router);
  private readonly preferences = inject(LocalPreferencesService);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  protected readonly options: readonly { readonly key: 'local' | 'cloud'; readonly icon: ArcTechIcon }[] = [
    { key: 'local', icon: 'hard-drive' },
    { key: 'cloud', icon: 'cloud' },
  ];
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
