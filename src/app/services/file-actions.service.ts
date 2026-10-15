import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  parseVaultFilePath,
  toInAppAssetRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import type { BacklinkDto, DocumentFileListItemDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';
import { WorkspaceService } from '@/services/workspace.service';

const LINKING_PREVIEW_MAX_TITLES = 5;

/**
 * Renaming and deleting vault files from the pages that show them, with the links pointing to them kept up
 * to date: shared by the note page, the asset page, the section page and the explorer.
 */
@Injectable({ providedIn: 'root' })
export class FileActionsService {
  private readonly documentService = inject(DocumentService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);
  /**
   * Files deleted in this session, until a page opens a file at that path again: a note page still showing
   * one (deleted from the explorer, say) must not save it back when it is left.
   */
  private readonly deletedPaths = new Set<string>();

  isDeleted(path: string): boolean {
    return this.deletedPaths.has(path);
  }

  /** A page opened a file at this path (a new note with the same name, say): it is saved normally again. */
  forgetDeleted(path: string): void {
    this.deletedPaths.delete(path);
  }

  /**
   * *Rename* an asset: the new name gives the file name (the extension stays), with a preview of the notes
   * linking to it and *Update links* (default on). `onRenamed` gets the new path.
   */
  async openRenameAssetSheet(
    file: Pick<DocumentFileListItemDto, 'path' | 'name'>,
    onRenamed?: (path: string) => void,
  ): Promise<void> {
    const { backlinks, sourceTitles, preview } = await this.loadLinkingNotes(file.path);
    const extension = /\.[^./]+$/.exec(file.name)?.[0] ?? '';
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
          ? this.translateService.instant('document.rename.linkedFrom', { notes: preview })
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

  /**
   * *Delete…* a note or an asset, after a confirmation listing the notes linking to it, with *Turn links into
   * plain text* (notes) / *Remove the embeds* (assets), default on. The file goes to the system Trash; tabs
   * showing it go to its folder page. `onDeleted` runs before that redirect (a page showing the file lets
   * go of it first) and gets the folder page's route.
   */
  async openDeleteSheet(
    file: { readonly path: string; readonly label: string; readonly isNote: boolean },
    onDeleted?: (folderRoute: string | null) => void,
  ): Promise<void> {
    const { backlinks, sourceTitles, preview } = await this.loadLinkingNotes(file.path);
    const fields: AppSheetField[] =
      sourceTitles.length > 0
        ? [
            {
              id: 'rewriteLinks',
              type: 'checkbox',
              value: true,
              checkboxLabel: this.translateService.instant(
                file.isNote ? 'files.delete.linksToText' : 'files.delete.removeEmbeds',
                { links: backlinks.length, notes: sourceTitles.length },
              ),
            },
          ]
        : [];

    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('files.delete.title', { name: file.label }),
      arcDescription: [
        sourceTitles.length > 0
          ? this.translateService.instant('document.rename.linkedFrom', { notes: preview })
          : this.translateService.instant('files.delete.noBacklinks'),
        this.translateService.instant('files.delete.trash'),
      ]
        // "Linked from: …" has no full stop of its own.
        .map((sentence) => (/[.!?。]$/.test(sentence) ? sentence : `${sentence}.`))
        .join(' '),
      arcOkText: this.translateService.instant('files.delete.submit'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields,
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const rewriteLinks = form.getValues()['rewriteLinks'] !== false;
          void this.deleteFile(file, rewriteLinks, onDeleted).then((isDeleted) => {
            isSubmitting = false;
            if (isDeleted) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  private async deleteFile(
    file: { readonly path: string; readonly label: string },
    rewriteLinks: boolean,
    onDeleted?: (folderRoute: string | null) => void,
  ): Promise<boolean> {
    try {
      const result = await this.documentService.deleteFile({ path: file.path, rewriteLinks });
      toast.success(this.translateService.instant('files.delete.done', { name: file.label }), {
        description:
          result.linkCount > 0
            ? this.translateService.instant('files.delete.linksUpdated', {
                links: result.linkCount,
                notes: result.updatedPaths.length,
              })
            : undefined,
      });
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      this.deletedPaths.add(file.path);
      const fileRoute = toInAppNoteRoute(file.path) ?? toInAppAssetRoute(file.path);
      const location = parseVaultFilePath(file.path);
      const folderRoute = location ? `${location.scopeRoute}/${location.section}` : null;
      onDeleted?.(folderRoute);
      if (fileRoute && folderRoute && this.workspace.isCampaignUrl(fileRoute)) {
        await this.workspace.replaceUrl(fileRoute, folderRoute);
      }
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('files.delete.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Notes linking to a file (from the index): their links, titles, and a short preview of the titles. */
  private async loadLinkingNotes(path: string): Promise<{
    backlinks: readonly BacklinkDto[];
    sourceTitles: readonly string[];
    preview: string;
  }> {
    let backlinks: readonly BacklinkDto[] = [];
    try {
      backlinks = (await this.documentService.links(path)).backlinks;
    } catch (error) {
      console.warn('[app] Failed to load the notes linking to a file:', path, error);
    }

    const sourceTitles = [
      ...new Map(
        backlinks.map((link) => [link.sourcePath, link.sourceTitle ?? link.sourcePath]),
      ).values(),
    ];
    const listedTitles = sourceTitles.slice(0, LINKING_PREVIEW_MAX_TITLES).join(', ');
    const hiddenCount = sourceTitles.length - LINKING_PREVIEW_MAX_TITLES;
    return {
      backlinks,
      sourceTitles,
      preview: hiddenCount > 0 ? `${listedTitles} +${hiddenCount}` : listedTitles,
    };
  }

  /** Renames an asset; returns its new path, or null when it failed (the error is shown). */
  private async renameAsset(
    path: string,
    name: string,
    updateLinks: boolean,
  ): Promise<string | null> {
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
