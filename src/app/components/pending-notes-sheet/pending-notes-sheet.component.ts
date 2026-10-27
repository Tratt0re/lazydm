import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CloudReadinessService } from '@/services/cloud-readiness.service';

/** The notes the cloud service has not downloaded yet, in a side sheet. Read-only. */
@Component({
  selector: 'app-pending-notes-sheet',
  imports: [TranslatePipe],
  template: `
    <div class="flex flex-col gap-3 p-4">
      @if (paths().length === 0) {
        <p class="text-sm text-muted-foreground">{{ 'vault.sync.noneLeft' | translate }}</p>
      } @else {
        <ul class="flex flex-col divide-y divide-border border border-border bg-card">
          @for (path of paths(); track path) {
            <li class="px-3 py-2 text-sm break-all">{{ path }}</li>
          }
        </ul>
        @if (hiddenCount() > 0) {
          <p class="text-xs text-muted-foreground">
            {{ 'vault.sync.conflictsMore' | translate: { count: hiddenCount() } }}
          </p>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppPendingNotesSheetComponent {
  private readonly cloudReadiness = inject(CloudReadinessService);

  protected readonly paths = computed(() => this.cloudReadiness.state()?.pendingPaths ?? []);
  protected readonly hiddenCount = computed(
    () => (this.cloudReadiness.state()?.pendingFiles ?? 0) - this.paths().length,
  );
}
