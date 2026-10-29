import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CloudReadinessService } from '@/services/cloud-readiness.service';
import { IndexStatusService } from '@/services/index-status.service';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechProgressBarComponent } from '@/shared/components/progress-bar';

/** Work shorter than this never shows the banner (no flash for a quick check). */
const SHOW_DELAY_MS = 400;
/** Once shown, the banner stays at least this long. */
const MIN_VISIBLE_MS = 800;

type ActivityKind = 'checking' | 'downloading' | 'indexing' | 'downloadingAssets';

interface Activity {
  readonly kind: ActivityKind;
  readonly done: number;
  readonly total: number;
}

/**
 * Thin banner under the toolbar showing what the vault is busy with: checking the cloud for changes,
 * downloading notes, scanning files for the index, or fetching assets in the background (with a counter when the total is known).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vault-activity-banner',
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechProgressBarComponent],
  templateUrl: './vault-activity-banner.component.html',
})
export class VaultActivityBannerComponent {
  private readonly cloud = inject(CloudReadinessService);
  private readonly index = inject(IndexStatusService);

  /** What is happening now, the cloud first: indexing follows the files it brings in. */
  private readonly current = computed<Activity | null>(() => {
    const cloud = this.cloud.state();
    if (cloud?.status === 'checking') {
      return { kind: 'checking', done: 0, total: 0 };
    }
    if (cloud?.status === 'downloading') {
      const total = this.cloud.downloadTotal();
      return { kind: 'downloading', done: Math.max(0, total - cloud.pendingFiles), total };
    }

    const index = this.index.state();
    if (index?.status === 'indexing') {
      return { kind: 'indexing', done: index.scannedCount, total: index.scanTotal };
    }

    if (cloud && cloud.pendingAssetFiles > 0) {
      const total = this.cloud.assetTotal();
      return { kind: 'downloadingAssets', done: Math.max(0, total - cloud.pendingAssetFiles), total };
    }

    return null;
  });

  /** The activity on screen: it appears after a delay and lingers a little once the work ends. */
  protected readonly shown = signal<Activity | null>(null);
  protected readonly progress = computed(() => {
    const activity = this.shown();
    return activity && activity.total > 0 ? (activity.done / activity.total) * 100 : 0;
  });
  protected readonly isIndeterminate = computed(() => (this.shown()?.total ?? 0) === 0);
  protected readonly indexError = computed(() => {
    const state = this.index.state();
    return state?.status === 'error' ? state.lastError : null;
  });

  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private shownAtMs = 0;

  constructor() {
    void this.cloud.connect();
    void this.index.connect();

    effect(() => {
      const activity = this.current();
      untracked(() => this.update(activity));
    });
  }

  private update(activity: Activity | null): void {
    if (activity) {
      this.clearTimer('hide');
      if (this.shown()) {
        this.shown.set(activity);
      } else if (this.showTimer === null) {
        this.showTimer = setTimeout(() => {
          this.showTimer = null;
          const latest = this.current();
          if (latest) {
            this.shownAtMs = Date.now();
            this.shown.set(latest);
          }
        }, SHOW_DELAY_MS);
      }
      return;
    }

    this.clearTimer('show');
    if (this.shown() && this.hideTimer === null) {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - this.shownAtMs));
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.shown.set(null);
      }, remaining);
    }
  }

  private clearTimer(which: 'show' | 'hide'): void {
    const timer = which === 'show' ? this.showTimer : this.hideTimer;
    if (timer !== null) {
      clearTimeout(timer);
    }
    if (which === 'show') {
      this.showTimer = null;
    } else {
      this.hideTimer = null;
    }
  }
}
