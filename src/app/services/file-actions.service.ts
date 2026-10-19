import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  parseVaultFilePath,
  toInAppAssetRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import type { BacklinkDto, DeleteFolderMode, DocumentFileListItemDto, SavedAssetDto } from '@/dtos';
import { AssetService } from '@/services/asset.service';
import { DocumentService } from '@/services/document.service';
import { WorkspaceService } from '@/services/workspace.service';

const LINKING_PREVIEW_MAX_TITLES = 5;

const NEW_NOTE_TITLE_FIELD: AppSheetField = {
  id: 'title',
  type: 'input',
  label: 'campaigns.sections.newNote.titleLabel',
  placeholder: 'campaigns.sections.newNote.titlePlaceholder',
  required: true,
  translate: true,
};

const NEW_FOLDER_NAME_FIELD: AppSheetField = {
  id: 'name',
  type: 'input',
  label: 'campaigns.sections.newFolder.nameLabel',
  placeholder: 'campaigns.sections.newFolder.namePlaceholder',
  required: true,
  translate: true,
};

/**
 * Creating, renaming and deleting vault files from the pages that show them, with the links pointing to them kept up
 * to date: shared by the note page, the asset page, the section page and the explorer.
 */
@Injectable({ providedIn: 'root' })
export class FileActionsService {
  private readonly documentService = inject(DocumentService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);
  private readonly assetService = inject(AssetService);
  private readonly router = inject(Router);
  /**
   * Files deleted in this session, until a page opens a file at that path again: a note page still showing
   * one (deleted from the explorer, say) must not save it back when it is left.
   */
  private readonly deletedPaths = new Set<string>();

  /**
   * Saves media files in a folder of the Assets section (dropped files, or picked in the system dialog when
   * `files` is not given); other files are skipped with a warning. Says where they went; false when nothing
   * was saved (cancelled, nothing usable, or an error, shown).
   */
  async saveMediaToFolder(folder: string, files?: readonly File[]): Promise<boolean> {
    const mediaFiles = files?.filter((file) => this.assetService.isMediaFile(file));
    const skipped = files?.filter((file) => !this.assetService.isMediaFile(file)) ?? [];
    if (skipped.length > 0) {
      toast.warning(this.translateService.instant('files.importFromDisk.skipped'), {
        description: skipped.map((file) => file.name).join(', '),
      });
    }
    if (mediaFiles && mediaFiles.length === 0) {
      return false;
    }

    let saved: readonly SavedAssetDto[];
    try {
      if (mediaFiles) {
        const results: SavedAssetDto[] = [];
        for (const file of mediaFiles) {
          results.push(await this.assetService.save({ folder }, file));
        }
        saved = results;
      } else {
        saved = await this.assetService.importFiles({ folder });
      }
    } catch (error) {
      toast.error(this.translateService.instant('document.assets.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    if (saved.length === 0) {
      return false;
    }

    // Files identical to an asset already there were not saved again (the toast says where that one is).
    const titleKey = saved.every((asset) => asset.isReused)
      ? 'document.assets.reused'
      : saved.length === 1
        ? 'document.assets.savedOne'
        : 'document.assets.savedMany';
    toast.success(this.translateService.instant(titleKey, { count: saved.length }), {
      description: saved.map((asset) => asset.path).join(', '),
    });
    return true;
  }

  isDeleted(path: string): boolean {
    return this.deletedPaths.has(path);
  }

  /** A page opened a file at this path (a new note with the same name, say): it is saved normally again. */
  forgetDeleted(path: string): void {
    this.deletedPaths.delete(path);
  }

  /** The note page showing a note saves its unsaved edits before the note is renamed from anywhere. */
  private readonly openNoteSavers = new Map<string, () => Promise<boolean>>();

  /** Registers the save of the note a page shows; returns the unregister function. */
  registerOpenNote(path: string, save: () => Promise<boolean>): () => void {
    this.openNoteSavers.set(path, save);
    return () => {
      if (this.openNoteSavers.get(path) === save) {
        this.openNoteSavers.delete(path);
      }
    };
  }

  /**
   * *New note* in a section folder or one of its sub-folders (`folder`, vault path), of the section's note
   * `type`; a sub-folder gives its sub-type (Electron side). Opens the new note, which is how both the section
   * page and the explorer create one.
   */
  openCreateNoteSheet(folder: { readonly path: string; readonly type: string; readonly sectionLabel: string }): void {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('campaigns.sections.newNote.title'),
      arcOkText: this.translateService.instant('campaigns.sections.newNote.submit'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [NEW_NOTE_TITLE_FIELD],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.createNote(folder, String(form.getValues()['title'] ?? '')).then((isCreated) => {
            isSubmitting = false;
            if (isCreated) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  /**
   * *New folder* directly in a section (`sectionPath`, vault path): one level of sub-folders, the sub-types of
   * its notes (plain folders in the special sections). `onCreated` gets the new folder's name.
   */
  openCreateFolderSheet(
    section: { readonly path: string; readonly label: string; readonly isSpecial: boolean },
    onCreated?: (name: string) => void,
  ): void {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('campaigns.sections.newFolder.title'),
      arcDescription: this.translateService.instant(
        section.isSpecial
          ? 'campaigns.sections.newFolder.specialDescription'
          : 'campaigns.sections.newFolder.description',
        { section: section.label },
      ),
      arcOkText: this.translateService.instant('campaigns.sections.newFolder.submit'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [NEW_FOLDER_NAME_FIELD],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.createFolder(section.path, String(form.getValues()['name'] ?? '')).then((name) => {
            isSubmitting = false;
            if (name) {
              sheetRef.close();
              onCreated?.(name);
            }
          });
        }

        return false;
      },
    });
  }

  private async createNote(
    folder: { readonly path: string; readonly type: string; readonly sectionLabel: string },
    title: string,
  ): Promise<boolean> {
    try {
      const note = await this.documentService.create({
        folder: folder.path,
        title,
        type: folder.type,
        section: folder.sectionLabel,
      });
      const route = toInAppNoteRoute(note.path);
      if (route) {
        await this.router.navigateByUrl(route);
      }
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.sections.newNote.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async createFolder(sectionPath: string, name: string): Promise<string | null> {
    try {
      return await this.documentService.createFolder(sectionPath, name);
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.sections.newFolder.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * *Rename* a note: the new title gives the file name, with a preview of the notes linking to it and *Update
   * links* (default on). Unsaved edits of the note, where it is open, are saved first. `onRenamed` gets the new
   * path before campaign tabs follow it (a page showing the note can remember things under the new path).
   */
  async openRenameNoteSheet(
    note: { readonly path: string; readonly title: string },
    onRenamed?: (path: string) => void | Promise<void>,
  ): Promise<void> {
    const save = this.openNoteSavers.get(note.path);
    if (save && !(await save())) {
      return;
    }

    const { backlinks, sourceTitles, preview } = await this.loadLinkingNotes(note.path);
    const fields: AppSheetField[] = [
      {
        id: 'title',
        type: 'input',
        label: 'document.rename.titleLabel',
        value: note.title,
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
      arcTitle: this.translateService.instant('document.rename.title'),
      arcDescription:
        sourceTitles.length > 0
          ? this.translateService.instant('document.rename.linkedFrom', { notes: preview })
          : this.translateService.instant('document.rename.noBacklinks'),
      arcOkText: this.translateService.instant('document.rename.submit'),
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields,
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.renameNote(
            note.path,
            String(values['title'] ?? ''),
            values['updateLinks'] !== false,
            onRenamed,
          ).then((isRenamed) => {
            isSubmitting = false;
            if (isRenamed) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  private async renameNote(
    path: string,
    title: string,
    updateLinks: boolean,
    onRenamed?: (path: string) => void | Promise<void>,
  ): Promise<boolean> {
    try {
      const result = await this.documentService.rename({ path, title, updateLinks });
      toast.success(
        this.translateService.instant('document.rename.done', {
          links: result.linkCount,
          notes: result.updatedPaths.length,
        }),
      );
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      await onRenamed?.(result.path);
      await this.followInTabs(toInAppNoteRoute(path), toInAppNoteRoute(result.path));
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('document.rename.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * *Rename…* a sub-folder of a section: the new name gives the folder slug; its notes' sub-type and the path
   * links through it follow. Unsaved edits of its notes, where open, are saved first; campaign tabs on its
   * notes and on its page follow. `onRenamed` gets the new folder name.
   */
  async openRenameFolderSheet(
    folder: { readonly path: string; readonly label: string; readonly fileCount: number },
    onRenamed?: (name: string) => void,
  ): Promise<void> {
    for (const [path, save] of this.openNoteSavers) {
      if (path.startsWith(`${folder.path}/`) && !(await save())) {
        return;
      }
    }

    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('files.renameFolder.title', { name: folder.label }),
      arcDescription: this.translateService.instant('files.renameFolder.description', {
        count: folder.fileCount,
      }),
      arcOkText: this.translateService.instant('document.rename.submit'),
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'campaigns.sections.renameAsset.nameLabel',
          value: folder.label,
          required: true,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.renameFolder(folder.path, String(form.getValues()['name'] ?? '')).then(
            (name) => {
              isSubmitting = false;
              if (name) {
                sheetRef.close();
                onRenamed?.(name);
              }
            },
          );
        }

        return false;
      },
    });
  }

  /** Renames a sub-folder; returns its new name, or null when it failed (the error is shown). */
  private async renameFolder(path: string, name: string): Promise<string | null> {
    try {
      const result = await this.documentService.renameFolder(path, name);
      toast.success(
        this.translateService.instant('files.renameFolder.done', { name: result.name }),
        result.linkCount > 0
          ? {
              description: this.translateService.instant('files.delete.linksUpdated', {
                links: result.linkCount,
                notes: result.updatedPaths.length,
              }),
            }
          : undefined,
      );
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      for (const { from, to } of result.moved) {
        await this.followInTabs(
          toInAppNoteRoute(from) ?? toInAppAssetRoute(from),
          toInAppNoteRoute(to) ?? toInAppAssetRoute(to),
        );
      }
      const location = parseVaultFilePath(`${path}/_`);
      if (location) {
        const sectionRoute = `${location.scopeRoute}/${location.section}`;
        await this.followInTabs(
          `${sectionRoute}?folder=${encodeURIComponent(path.split('/').pop() ?? '')}`,
          `${sectionRoute}?folder=${encodeURIComponent(result.name)}`,
        );
      }
      return result.name;
    } catch (error) {
      toast.error(this.translateService.instant('files.renameFolder.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * *Delete…* a sub-folder, after a confirmation with its file count: **move its files to the main folder**
   * (default; links rewritten, sub-type removed; a name taken there stops it, listed, the sheet stays open)
   * or **delete them too** (links to them turned into plain text / embeds removed, unless unticked). The
   * folder goes to the system Trash; tabs on its files follow them or go to the section page.
   */
  async openDeleteFolderSheet(
    folder: { readonly path: string; readonly label: string; readonly fileCount: number },
    onDeleted?: () => void,
  ): Promise<void> {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('files.deleteFolder.title', { name: folder.label }),
      arcDescription: this.translateService.instant('files.deleteFolder.description', {
        count: folder.fileCount,
      }),
      arcOkText: this.translateService.instant('files.delete.submit'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields: [
        {
          id: 'mode',
          type: 'select',
          label: 'files.deleteFolder.modeLabel',
          value: 'moveToMain',
          required: true,
          translate: true,
          options: [
            {
              value: 'moveToMain',
              label: this.translateService.instant('files.deleteFolder.moveToMain'),
              icon: 'move-right',
              translate: false,
            },
            {
              value: 'delete',
              label: this.translateService.instant('files.deleteFolder.deleteFiles'),
              icon: 'trash',
              translate: false,
            },
          ],
        },
        {
          id: 'rewriteLinks',
          type: 'checkbox',
          value: true,
          checkboxLabel: this.translateService.instant('files.deleteFolder.rewriteLinks'),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          const mode: DeleteFolderMode = values['mode'] === 'delete' ? 'delete' : 'moveToMain';
          void this.deleteFolder(folder.path, mode, values['rewriteLinks'] !== false).then(
            (isDeleted) => {
              isSubmitting = false;
              if (isDeleted) {
                sheetRef.close();
                onDeleted?.();
              }
            },
          );
        }

        return false;
      },
    });
  }

  /** Deletes a sub-folder; false when it did not happen (name clashes or an error, both shown). */
  private async deleteFolder(
    path: string,
    mode: DeleteFolderMode,
    rewriteLinks: boolean,
  ): Promise<boolean> {
    // Moving: open notes inside are saved first, so their edits move with them.
    if (mode === 'moveToMain') {
      for (const [notePath, save] of this.openNoteSavers) {
        if (notePath.startsWith(`${path}/`) && !(await save())) {
          return false;
        }
      }
    }

    try {
      const result = await this.documentService.deleteFolder(path, mode, rewriteLinks);
      if (result.status === 'clashes') {
        toast.error(this.translateService.instant('files.deleteFolder.clashes'), {
          description: result.clashes.join(', '),
        });
        return false;
      }

      toast.success(
        this.translateService.instant('files.deleteFolder.done', {
          name: path.split('/').pop(),
        }),
        result.linkCount > 0
          ? {
              description: this.translateService.instant('files.delete.linksUpdated', {
                links: result.linkCount,
                notes: result.updatedPaths.length,
              }),
            }
          : undefined,
      );
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      const location = parseVaultFilePath(`${path}/_`);
      const sectionRoute = location ? `${location.scopeRoute}/${location.section}` : null;
      for (const { from, to } of result.moved) {
        await this.followInTabs(
          toInAppNoteRoute(from) ?? toInAppAssetRoute(from),
          toInAppNoteRoute(to) ?? toInAppAssetRoute(to),
        );
      }
      for (const deletedPath of result.deleted) {
        this.deletedPaths.add(deletedPath);
        await this.followInTabs(
          toInAppNoteRoute(deletedPath) ?? toInAppAssetRoute(deletedPath),
          sectionRoute,
        );
      }
      if (sectionRoute) {
        await this.followInTabs(
          `${sectionRoute}?folder=${encodeURIComponent(path.split('/').pop() ?? '')}`,
          sectionRoute,
        );
      }
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('files.deleteFolder.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * A section was deleted with its files: tabs and history showing the section, one of its sub-folders or one of
   * its files go to the campaign overview, and the deleted notes are never saved back.
   */
  async followDeletedSection(
    campaign: string,
    sectionKey: string,
    deletedPaths: readonly string[],
  ): Promise<void> {
    const overviewRoute = `/campaigns/${campaign}`;
    const sectionRoute = `${overviewRoute}/${sectionKey}`;
    const subfolders = new Set<string>();
    for (const deletedPath of deletedPaths) {
      this.deletedPaths.add(deletedPath);
      const subfolder = parseVaultFilePath(deletedPath)?.subfolder;
      if (subfolder) {
        subfolders.add(subfolder);
      }

      await this.followInTabs(
        toInAppNoteRoute(deletedPath) ?? toInAppAssetRoute(deletedPath),
        overviewRoute,
      );
    }

    for (const subfolder of subfolders) {
      await this.followInTabs(
        `${sectionRoute}?folder=${encodeURIComponent(subfolder)}`,
        overviewRoute,
      );
    }
    await this.followInTabs(sectionRoute, overviewRoute);
  }

  /** Campaign tabs and history pointing to a renamed file follow it (a system page navigates itself). */
  private async followInTabs(oldRoute: string | null, newRoute: string | null): Promise<void> {
    if (oldRoute && newRoute && oldRoute !== newRoute && this.workspace.isCampaignUrl(oldRoute)) {
      await this.workspace.replaceUrl(oldRoute, newRoute);
    }
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
      await this.followInTabs(toInAppAssetRoute(path), toInAppAssetRoute(result.path));
      return result.path;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.sections.renameAsset.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
