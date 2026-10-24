import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { FileActionsService } from '@/services/file-actions.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ARC_MODAL_DATA, ArcTechDialogRef } from '@/shared/components/dialog';
import { ArcTechIconComponent } from '@/shared/components/icon';

/** What the *Import from disk* modal saves into, and what to do once files are saved. */
export interface AssetImportSheetData {
  /** A folder of the Assets section (vault-relative). */
  readonly folder: string;
  readonly onImported?: () => void;
}

/**
 * Content of the *Import from disk* modal (Assets section): a drop zone for files from the file manager, a paste
 * target (Cmd/Ctrl+V with a copied image or file) and *Select files* for the system dialog. The modal closes once
 * files are saved.
 */
@Component({
  selector: 'app-asset-import-sheet',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent],
  template: `
    <div
      #zone
      tabindex="0"
      class="flex min-h-56 flex-col items-center justify-center gap-4 border border-dashed p-6 text-center transition-colors outline-none focus-visible:border-primary"
      [class]="
        isDragOver()
          ? 'border-primary bg-accent text-primary'
          : 'border-border-strong bg-recessed text-muted-foreground'
      "
      (dragover)="onDragOver($event)"
      (dragleave)="isDragOver.set(false)"
      (drop)="onDrop($event)"
      (paste)="onPaste($event)"
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
  host: { class: 'block px-1 pb-1' },
})
export class AppAssetImportSheetComponent {
  private readonly data = inject<AssetImportSheetData>(ARC_MODAL_DATA);
  private readonly dialogRef = inject(ArcTechDialogRef);
  private readonly fileActions = inject(FileActionsService);
  private readonly zone = viewChild.required<ElementRef<HTMLElement>>('zone');

  protected readonly isDragOver = signal(false);
  protected readonly isSaving = signal(false);

  constructor() {
    // The zone has the focus when the modal opens, so Cmd/Ctrl+V works right away.
    afterNextRender(() => this.zone().nativeElement.focus());
  }

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

  /** A copied image or file pasted on the zone is saved like a dropped one. */
  protected onPaste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length > 0) {
      event.preventDefault();
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
        this.dialogRef.close();
      }
    } finally {
      this.isSaving.set(false);
    }
  }
}
