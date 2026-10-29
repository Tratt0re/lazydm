import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AppPendingNotesSheetComponent } from '@/components/pending-notes-sheet/pending-notes-sheet.component';

import { CloudReadinessService } from '@/services/cloud-readiness.service';
import { IndexStatusService } from '@/services/index-status.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechProgressBarComponent } from '@/shared/components/progress-bar';
import { ArcTechSheetService } from '@/shared/components/sheet';

const CONFLICT_PATHS_PREVIEW_LIMIT = 5;
/** The blocking screen offers a way out only after this long, so a short wait is never skipped by reflex. */
const SKIP_AVAILABLE_AFTER_MS = 10_000;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vault-sync-status',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechProgressBarComponent,
  ],
  templateUrl: './vault-sync-status.component.html',
})
export class VaultSyncStatusComponent {
  private readonly cloudReadinessService = inject(CloudReadinessService);
  private readonly indexStatusService = inject(IndexStatusService);
  private readonly sheetService = inject(ArcTechSheetService);
  private readonly translateService = inject(TranslateService);
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
  /** The running work, if it is big enough to block the app: the download first, the indexing after it. */
  private readonly blockingPhase = computed<'downloading' | 'indexing' | null>(() => {
    if (this.cloudReadinessService.isDownloading()) {
      return 'downloading';
    }

    const index = this.indexStatusService.state();
    return index?.status === 'indexing' && index.isLargeUpdate ? 'indexing' : null;
  });
  private readonly overlayDismissed = signal(false);
  protected readonly canSkip = signal(false);
  protected readonly phase = this.blockingPhase;
  protected readonly showOverlay = computed(
    () => this.blockingPhase() !== null && !this.overlayDismissed(),
  );
  protected readonly indexDone = computed(() => this.indexStatusService.state()?.scannedCount ?? 0);
  protected readonly indexTotal = computed(() => this.indexStatusService.state()?.scanTotal ?? 0);
  protected readonly indexProgress = computed(() =>
    this.indexTotal() > 0 ? (this.indexDone() / this.indexTotal()) * 100 : 0,
  );
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
      this.conflictPaths().length > 0 &&
      this.dismissedConflictsKey() !== this.conflictPaths().join('\n'),
  );

  private skipTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.cloudReadinessService.connect();
    void this.indexStatusService.connect();

    // Each new blocking run starts with no skip and a visible screen; the skip shows up after a while.
    effect(() => {
      const isBlocking = this.blockingPhase() !== null;
      untracked(() => {
        if (this.skipTimer !== null) {
          clearTimeout(this.skipTimer);
          this.skipTimer = null;
        }
        if (isBlocking) {
          this.skipTimer = setTimeout(() => this.canSkip.set(true), SKIP_AVAILABLE_AFTER_MS);
        } else {
          this.canSkip.set(false);
          this.overlayDismissed.set(false);
        }
      });
    });
  }

  /** Leaves the screen. A download keeps going in the background; an indexing run too, the app just stops waiting. */
  protected skipWait(): void {
    this.overlayDismissed.set(true);
    if (this.cloudReadinessService.isDownloading()) {
      void this.runTask(() => this.cloudReadinessService.skipWait());
    }
  }

  protected recheck(): void {
    void this.runTask(() => this.cloudReadinessService.recheck());
  }

  protected openPendingNotes(): void {
    this.sheetService.create<AppPendingNotesSheetComponent, void>({
      arcTitle: this.translateService.instant('vault.sync.pendingTitle'),
      arcContent: AppPendingNotesSheetComponent,
      arcSide: 'right',
      arcWidth: '560px',
      arcHideFooter: true,
    });
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
