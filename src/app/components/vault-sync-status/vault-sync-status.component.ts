import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CloudReadinessService } from '@/services/cloud-readiness.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechProgressBarComponent } from '@/shared/components/progress-bar';

const CONFLICT_PATHS_PREVIEW_LIMIT = 5;

@Component({
  selector: 'app-vault-sync-status',
  imports: [TranslatePipe, ArcTechAlertComponent, ArcTechButtonComponent, ArcTechProgressBarComponent],
  templateUrl: './vault-sync-status.component.html',
})
export class VaultSyncStatusComponent {
  private readonly cloudReadinessService = inject(CloudReadinessService);
  private readonly dismissedConflictsKey = signal<string | null>(null);

  protected readonly state = this.cloudReadinessService.state;
  protected readonly isBusy = signal(false);
  protected readonly providerLabelKey = computed(
    () => `vault.sync.providers.${this.state()?.provider ?? 'generic'}`,
  );
  protected readonly downloadTotal = this.cloudReadinessService.downloadTotal;
  protected readonly downloadedCount = computed(
    () => this.downloadTotal() - (this.state()?.pendingFiles ?? 0),
  );
  protected readonly downloadProgress = computed(() =>
    this.downloadTotal() > 0 ? (this.downloadedCount() / this.downloadTotal()) * 100 : 0,
  );
  protected readonly showOverlay = this.cloudReadinessService.isDownloading;
  protected readonly showPendingNotice = computed(() => {
    const state = this.state();
    return (state?.status === 'timeout' || state?.status === 'skipped') && state.pendingFiles > 0;
  });
  protected readonly conflictPaths = computed(() => this.state()?.conflictPaths ?? []);
  protected readonly conflictPathsPreview = computed(() =>
    this.conflictPaths().slice(0, CONFLICT_PATHS_PREVIEW_LIMIT),
  );
  protected readonly hiddenConflictCount = computed(
    () => this.conflictPaths().length - this.conflictPathsPreview().length,
  );
  protected readonly showConflicts = computed(
    () =>
      this.conflictPaths().length > 0 && this.dismissedConflictsKey() !== this.conflictPaths().join('\n'),
  );

  constructor() {
    void this.cloudReadinessService.connect();
  }

  protected skipWait(): void {
    void this.runTask(() => this.cloudReadinessService.skipWait());
  }

  protected recheck(): void {
    void this.runTask(() => this.cloudReadinessService.recheck());
  }

  protected dismissConflicts(): void {
    this.dismissedConflictsKey.set(this.conflictPaths().join('\n'));
  }

  private async runTask(task: () => Promise<void>): Promise<void> {
    this.isBusy.set(true);
    try {
      await task();
    } catch (error) {
      console.warn('[app] Cloud readiness action failed:', error);
    } finally {
      this.isBusy.set(false);
    }
  }
}
