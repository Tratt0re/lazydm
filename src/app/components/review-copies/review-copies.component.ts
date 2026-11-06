import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { toAssetUrl } from '@/components/document-preview/document-preview.markdown';
import type { CopyComparisonDto, CopyRepairAction, SyncCopyDto } from '@/dtos';
import { AssetService } from '@/services/asset.service';
import { CopiesService } from '@/services/copies.service';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';

const ACTION_ICONS: Readonly<Record<CopyRepairAction, 'check' | 'copy' | 'rotate-ccw'>> = {
  'keep-original': 'check',
  'keep-both': 'copy',
  'restore-name': 'rotate-ccw',
};

/**
 * The *Copies made by sync* group of the Review page: files a cloud service kept next to (or instead of) a note or
 * file (`goblin 2.md`). A row opens a panel under it with the copy and its original side by side; the user decides.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-review-copies',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent],
  templateUrl: './review-copies.component.html',
})
export class ReviewCopiesComponent {
  private readonly copiesService = inject(CopiesService);
  private readonly assetService = inject(AssetService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);

  readonly copies = input.required<readonly SyncCopyDto[]>();
  /** A repair changed files: the Review page reloads. */
  readonly repaired = output<void>();

  protected readonly openPath = signal<string | null>(null);
  protected readonly comparison = signal<CopyComparisonDto | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly isBusy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private loadToken = 0;

  protected nameOf(path: string): string {
    return path.split('/').pop() ?? path;
  }

  protected actionIcon(action: CopyRepairAction): 'check' | 'copy' | 'rotate-ccw' {
    return ACTION_ICONS[action];
  }

  /** The image of an asset, to see which of the two files is the one to keep. */
  protected imageUrl(path: string): string | null {
    return this.assetService.getAssetKind(path) === 'image' ? toAssetUrl(path) : null;
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected formatDate(ms: number): string {
    return new Date(ms).toLocaleString();
  }

  protected toggle(copy: SyncCopyDto): void {
    if (this.openPath() === copy.path) {
      this.openPath.set(null);
      this.comparison.set(null);
      return;
    }

    this.openPath.set(copy.path);
    void this.load(copy.path);
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    this.comparison.set(null);
    this.errorMessage.set(null);
    this.isLoading.set(true);
    try {
      const comparison = await this.copiesService.compare(path);
      if (token === this.loadToken) {
        this.comparison.set(comparison);
      }
    } catch (error) {
      if (token === this.loadToken) {
        this.errorMessage.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (token === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  protected run(comparison: CopyComparisonDto, action: CopyRepairAction): void {
    // Keeping the original sends the copy to the Trash: ask first.
    if (action === 'keep-original') {
      this.alertDialogService.confirm({
        arcTitle: this.translateService.instant('review.copies.confirm.title', {
          name: this.nameOf(comparison.path),
        }),
        arcDescription: this.translateService.instant('review.copies.confirm.description', {
          name: this.nameOf(comparison.path),
          original: this.nameOf(comparison.originalPath),
        }),
        arcOkText: this.translateService.instant('review.copies.confirm.ok'),
        arcCancelText: this.translateService.instant('review.cancel'),
        arcOkDestructive: true,
        arcOnOk: () => void this.apply(comparison, action),
      });
      return;
    }

    void this.apply(comparison, action);
  }

  private async apply(comparison: CopyComparisonDto, action: CopyRepairAction): Promise<void> {
    this.isBusy.set(true);
    try {
      const result = await this.copiesService.resolve({
        path: comparison.path,
        action,
        copyHash: comparison.copy.hash,
        originalHash: comparison.original?.hash ?? null,
      });
      toast.success(
        this.translateService.instant(`review.copies.done.${action}`, {
          name: this.nameOf(result.path),
        }),
        {
          description:
            result.linkCount > 0
              ? this.translateService.instant('files.delete.linksUpdated', {
                  links: result.linkCount,
                  notes: result.updatedPaths.length,
                })
              : undefined,
        },
      );
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      this.openPath.set(null);
      this.comparison.set(null);
      this.repaired.emit();
    } catch (error) {
      toast.error(this.translateService.instant('review.copies.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      // The files may have changed: show them again.
      if (this.openPath()) {
        void this.load(comparison.path);
      }
    } finally {
      this.isBusy.set(false);
    }
  }
}
