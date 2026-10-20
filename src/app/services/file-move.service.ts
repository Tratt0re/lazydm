import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { DocumentFileListItemDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';
import { toSubfolderLabel } from '@/services/section.service';
import { WorkspaceService } from '@/services/workspace.service';

/** Menu label of *Reveal* on each system (the file manager's own name). */
const REVEAL_LABELS: Readonly<Record<string, string>> = {
  darwin: 'campaigns.sections.reveal.mac',
  win32: 'campaigns.sections.reveal.windows',
};

/** The section a file can move inside: its folder, display name and sub-folders. */
export interface MoveSection {
  /** Vault-relative section folder, e.g. `lost-mine/enemies` or `compendium/srd/spells`. */
  readonly path: string;
  readonly label: string;
  readonly folders: readonly string[];
}

/**
 * Moving a file between its section and the section's sub-folders (links updated, open tabs retargeted), and
 * revealing a path in the file manager: shared by the section page and the explorer sidebar.
 */
@Injectable({ providedIn: 'root' })
export class FileMoveService {
  private readonly documentService = inject(DocumentService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly translateService = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);

  readonly revealLabel =
    REVEAL_LABELS[window.electronAPI?.platform ?? ''] ?? 'campaigns.sections.reveal.other';

  /** Sub-folder of the section a file is in (`''` directly in the section). */
  folderOf(path: string, sectionPath: string): string {
    const parts = path.slice(sectionPath.length + 1).split('/');
    return parts.length > 1 ? parts[0] : '';
  }

  /** *Move to…*: the section itself or one of its sub-folders; `onMoved` runs after a successful move. */
  openMoveSheet(file: DocumentFileListItemDto, section: MoveSection, onMoved?: () => void): void {
    const current = this.folderOf(file.path, section.path);
    const targets = [
      {
        value: '',
        label: this.translateService.instant('campaigns.sections.move.mainFolder', {
          section: section.label,
        }),
      },
      ...section.folders.map((name) => ({ value: name, label: toSubfolderLabel(name) })),
    ].filter((target) => target.value !== current);
    if (targets.length === 0) {
      toast.info(this.translateService.instant('campaigns.sections.move.noFolders'));
      return;
    }

    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('review.move.title', {
        title: file.kind === 'md' ? file.title : file.name,
      }),
      arcDescription: this.translateService.instant('campaigns.sections.move.description'),
      arcOkText: this.translateService.instant('review.move.submit'),
      arcCancelText: this.translateService.instant('review.cancel'),
      fields: [
        {
          id: 'folder',
          type: 'select',
          label: 'campaigns.sections.move.folderLabel',
          value: targets[0].value,
          required: false,
          translate: true,
          options: targets.map((target) => ({ ...target, icon: 'folder', translate: false })),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const target = String(form.getValues()['folder'] ?? targets[0].value);
          void this.move(file.path, section, target).then((isMoved) => {
            isSubmitting = false;
            dialogRef.close();
            if (isMoved) {
              onMoved?.();
            }
          });
        }

        return false;
      },
    });
  }

  /** Moves a file to `target` (a sub-folder name, `''` for the section itself); false when nothing moved. */
  async move(path: string, section: MoveSection, target: string): Promise<boolean> {
    if (this.folderOf(path, section.path) === target) {
      return false;
    }

    const folder = target ? `${section.path}/${target}` : section.path;
    try {
      const result = await this.documentService.move(path, folder);
      const oldRoute = toInAppNoteRoute(path);
      const newRoute = toInAppNoteRoute(result.path);
      if (oldRoute && newRoute) {
        await this.workspace.replaceUrl(oldRoute, newRoute);
      }

      toast.success(
        this.translateService.instant('campaigns.sections.move.done', {
          name: path.split('/').pop(),
          folder: target ? toSubfolderLabel(target) : section.label,
        }),
        result.failedPaths.length > 0
          ? {
              description: this.translateService.instant('review.move.failedLinks', {
                paths: result.failedPaths.join(', '),
              }),
            }
          : undefined,
      );
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('review.move.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  reveal(path: string): void {
    this.documentService.reveal(path).catch((error: unknown) =>
      toast.error(this.translateService.instant('campaigns.sections.reveal.error'), {
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
