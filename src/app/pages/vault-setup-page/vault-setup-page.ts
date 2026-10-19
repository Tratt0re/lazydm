import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { VaultInspectionDto, VaultStateDto } from '@/dtos';
import { VaultService } from '@/services/vault.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';

type VaultFolderDetection = 'existing' | 'empty' | 'nonEmpty';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vault-setup-page',
  imports: [TranslatePipe, ArcTechAlertComponent, ArcTechBadgeComponent, ArcTechButtonComponent, ArcTechIconComponent],
  templateUrl: './vault-setup-page.html',
})
export class VaultSetupPage implements OnInit {
  private readonly vaultService = inject(VaultService);
  private readonly router = inject(Router);

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

  protected retry(): void {
    void this.runTask(async () => {
      await this.navigateWhenReady(await this.vaultService.loadCurrent());
    });
  }

  private async navigateWhenReady(state: VaultStateDto): Promise<void> {
    if (state.status === 'ready') {
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
