import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import type { BacklinkDto, DocumentFileListItemDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';

const RENAME_PREVIEW_MAX_TITLES = 5;

/**
 * Renaming (and, later, deleting) vault files from the pages that list them, with the links pointing to
 * them kept up to date: shared by the section page and the asset page.
 */
@Injectable({ providedIn: 'root' })
export class FileActionsService {
  private readonly documentService = inject(DocumentService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);

  /**
   * *Rename* an asset: the new name gives the file name (the extension stays), with a preview of the notes
   * linking to it and *Update links* (default on). `onRenamed` gets the new path.
   */
  async openRenameAssetSheet(
    file: DocumentFileListItemDto,
    onRenamed?: (path: string) => void,
  ): Promise<void> {
    let backlinks: readonly BacklinkDto[] = [];
    try {
      backlinks = (await this.documentService.links(file.path)).backlinks;
    } catch (error) {
      console.warn('[app] Failed to load backlinks for rename:', file.path, error);
    }

    const extension = /\.[^./]+$/.exec(file.name)?.[0] ?? '';
    const sourceTitles = [
      ...new Map(
        backlinks.map((link) => [link.sourcePath, link.sourceTitle ?? link.sourcePath]),
      ).values(),
    ];
    const listedTitles = sourceTitles.slice(0, RENAME_PREVIEW_MAX_TITLES).join(', ');
    const hiddenCount = sourceTitles.length - RENAME_PREVIEW_MAX_TITLES;
    const fields: AppSheetField[] = [
      {
        id: 'name',
        type: 'input',
        label: 'campaigns.sections.renameAsset.nameLabel',
        value: extension ? file.name.slice(0, -extension.length) : file.name,
        required: true,
        translate: true,
      },
    ];
    if (sourceTitles.length > 0) {
      fields.push({
        id: 'updateLinks',
        type: 'checkbox',
        value: true,
        checkboxLabel: this.translateService.instant('document.rename.updateLinks', {
          links: backlinks.length,
          notes: sourceTitles.length,
        }),
      });
    }

    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('campaigns.sections.renameAsset.title', {
        name: file.name,
      }),
      arcDescription:
        sourceTitles.length > 0
          ? this.translateService.instant('document.rename.linkedFrom', {
              notes: hiddenCount > 0 ? `${listedTitles} +${hiddenCount}` : listedTitles,
            })
          : this.translateService.instant('campaigns.sections.renameAsset.noBacklinks'),
      arcOkText: this.translateService.instant('document.rename.submit'),
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields,
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.renameAsset(
            file.path,
            String(values['name'] ?? ''),
            values['updateLinks'] !== false,
          ).then((path) => {
            isSubmitting = false;
            if (path) {
              sheetRef.close();
              onRenamed?.(path);
            }
          });
        }

        return false;
      },
    });
  }

  /** Renames an asset; returns its new path, or null when it failed (the error is shown). */
  private async renameAsset(path: string, name: string, updateLinks: boolean): Promise<string | null> {
    try {
      const result = await this.documentService.renameAsset({ path, name, updateLinks });
      toast.success(
        this.translateService.instant('campaigns.sections.renameAsset.done', {
          name: result.path.split('/').pop(),
          links: result.linkCount,
          notes: result.updatedPaths.length,
        }),
      );
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }
      return result.path;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.sections.renameAsset.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
