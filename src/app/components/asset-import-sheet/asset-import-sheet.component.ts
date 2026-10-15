import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { FileActionsService } from '@/services/file-actions.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ARC_SHEET_DATA, ArcTechSheetRef } from '@/shared/components/sheet';

/** What the *Import from disk* sheet saves into, and what to do once files are saved. */
export interface AssetImportSheetData {
  /** A folder of the Assets section (vault-relative). */
  readonly folder: string;
  readonly onImported?: () => void;
}

/**
 * Content of the *Import from disk* sheet (Assets section): a drop zone for files from the file manager and
 * *Select files* for the system dialog. The sheet closes once files are saved.
 */
@Component({
  selector: 'app-asset-import-sheet',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent],
  template: `
    <div
      class="flex min-h-64 flex-col items-center justify-center gap-4 border border-dashed p-6 text-center transition-colors"
      [class]="isDragOver() ? 'border-primary bg-accent text-primary' : 'border-border-strong bg-recessed text-muted-foreground'"
      (dragover)="onDragOver($event)"
      (dragleave)="isDragOver.set(false)"
      (drop)="onDrop($event)"
    >
      <arc-icon arcType="file-up" class="size-8" />
      <p class="max-w-xs text-sm">{{ 'files.importFromDisk.dropHint' | translate }}</p>
      <p class="font-mono text-[11px] tracking-[0.04em] uppercase">
        {{ 'files.importFromDisk.types' | translate }}
      </p>
      <button
        type="button"
        arc-button
        arcType="outline"
        [disabled]="isSaving()"
        (click)="selectFiles()"
      >
        <arc-icon arcType="folder" />
        {{ 'files.importFromDisk.select' | translate }}
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The same inset as the sheet form's fields.
  host: { class: 'block p-4' },
})
export class AppAssetImportSheetComponent {
  private readonly data = inject<AssetImportSheetData>(ARC_SHEET_DATA);
  private readonly sheetRef = inject(ArcTechSheetRef);
  private readonly fileActions = inject(FileActionsService);

  protected readonly isDragOver = signal(false);
  protected readonly isSaving = signal(false);

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      this.isDragOver.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) {
      void this.save(files);
    }
  }

  protected selectFiles(): void {
    void this.save();
  }

  private async save(files?: readonly File[]): Promise<void> {
    this.isSaving.set(true);
    try {
      if (await this.fileActions.saveMediaToFolder(this.data.folder, files)) {
        this.data.onImported?.();
        this.sheetRef.close();
      }
    } finally {
      this.isSaving.set(false);
    }
  }
}
