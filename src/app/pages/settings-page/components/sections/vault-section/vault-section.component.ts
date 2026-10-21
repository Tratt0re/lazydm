import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { ResetService } from '@/services/reset.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog/alert-dialog.service';
import { ArcTechButtonComponent } from '@/shared/components/button';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vault-section',
  imports: [TranslatePipe, ArcTechButtonComponent],
  templateUrl: './vault-section.component.html',
})
export class VaultSectionComponent {
  private readonly vaultService = inject(VaultService);
  private readonly resetService = inject(ResetService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly vault = this.vaultService.currentVault;
  protected readonly isBusy = signal(false);

  /** Closes the vault (its files stay where they are) and goes back to the vault chooser. */
  protected confirmClose(): void {
    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('settings.vault.close.title'),
      arcDescription: this.translateService.instant('settings.vault.close.description'),
      arcOkText: this.translateService.instant('settings.vault.close.confirm'),
      arcCancelText: this.translateService.instant('common.cancel'),
      arcOnOk: () => {
        void this.run(async () => {
          await this.vaultService.close();
          await this.router.navigateByUrl('/setup');
        }, 'settings.vault.close.error');
      },
    });
  }

  /** Forgets the vault and this device's settings; the vault folder and its notes are not touched. */
  protected confirmReset(): void {
    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('settings.vault.reset.title'),
      arcDescription: this.translateService.instant('settings.vault.reset.description'),
      arcOkText: this.translateService.instant('settings.vault.reset.confirm'),
      arcCancelText: this.translateService.instant('common.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => {
        void this.run(async () => {
          await this.resetService.factoryReset();
          await this.vaultService.loadCurrent();
          // Settings kept in the browser (theme, language, editor) go too; the app starts again from scratch.
          try {
            localStorage.clear();
          } catch {
            // Storage can be unavailable; the main-process settings are already cleared.
          }
          window.location.assign('/');
        }, 'settings.vault.reset.error');
      },
    });
  }

  private async run(task: () => Promise<void>, errorKey: string): Promise<void> {
    this.isBusy.set(true);
    try {
      await task();
    } catch (error) {
      console.warn('[app] Vault settings action failed:', error);
      toast.error(this.translateService.instant(errorKey));
    } finally {
      this.isBusy.set(false);
    }
  }
}
