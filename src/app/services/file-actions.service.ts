import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  parseVaultFilePath,
  toInAppAssetRoute,
  toInAppEncounterRoute,
  toInAppMapRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { IMPORT_IMAGE_CHOICE } from '@/config/map.config';
import {
  AppAssetImportSheetComponent,
  type AssetImportSheetData,
} from '@/components/asset-import-sheet/asset-import-sheet.component';
import {
  AppDialogFormService,
  type AppDialogWizardStep,
} from '@/components/sheet-form/dialog-form.service';
import { ArcTechDialogService } from '@/shared/components/dialog';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import type {
  BacklinkDto,
  DeleteFolderMode,
  DocumentFileListItemDto,
  MapFileDto,
  SavedAssetDto,
} from '@/dtos';
import { AssetService } from '@/services/asset.service';
import { DocumentService } from '@/services/document.service';
import { EncounterService } from '@/services/encounter.service';
import { MapService } from '@/services/map.service';
import type { SectionIcon } from '@/services/section.service';
import { WorkspaceService } from '@/services/workspace.service';

const LINKING_PREVIEW_MAX_TITLES = 5;
const ENCOUNTERS_SECTION_KEY = 'encounters';
const MAPS_SECTION_KEY = 'maps';

const NEW_NOTE_TITLE_FIELD: AppSheetField = {
  id: 'title',
  type: 'input',
  label: 'campaigns.sections.newNote.titleLabel',
  placeholder: 'campaigns.sections.newNote.titlePlaceholder',
  required: true,
  translate: true,
};

const NEW_ENCOUNTER_NAME_FIELD: AppSheetField = {
  id: 'name',
  type: 'input',
  label: 'encounters.new.nameLabel',
  placeholder: 'encounters.new.namePlaceholder',
  required: true,
  translate: true,
};

const NEW_MAP_NAME_FIELD: AppSheetField = {
  id: 'name',
  type: 'input',
  label: 'maps.new.nameLabel',
  placeholder: 'maps.new.namePlaceholder',
  required: true,
  translate: true,
};

const MAP_IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

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
  private readonly encounterService = inject(EncounterService);
  private readonly mapService = inject(MapService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly dialogService = inject(ArcTechDialogService);
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
  /** Every page showing a note, by path: the registry above keeps one of them. */
  private readonly openNotePages = new Map<string, (() => Promise<boolean>)[]>();

  /**
   * Registers the save of the note a page shows; returns the unregister function. The same note can be shown by
   * both panes (one shared document, so any page's save writes the same text): the note stays registered while any
   * of its pages does, and a page leaving never drops the entry of the one that stays.
   */
  registerOpenNote(path: string, save: () => Promise<boolean>): () => void {
    const savers = this.openNotePages.get(path) ?? [];
    savers.push(save);
    this.openNotePages.set(path, savers);
    this.openNoteSavers.set(path, savers[0]);

    return () => {
      const remaining = (this.openNotePages.get(path) ?? []).filter((item) => item !== save);
      if (remaining.length === 0) {
        this.openNotePages.delete(path);
        this.openNoteSavers.delete(path);
      } else {
        this.openNotePages.set(path, remaining);
        this.openNoteSavers.set(path, remaining[0]);
      }
    };
  }

  /** *Save* of the application menu: every open note writes its unsaved edits (a clean note does nothing). */
  async saveOpenNotes(): Promise<void> {
    for (const save of this.openNoteSavers.values()) {
      await save();
    }
  }

  /**
   * *New note* in a section folder or one of its sub-folders (`folder`, vault path), of the section's note
   * `type`. Opens the new note, which is how both the section
   * page and the explorer create one.
   */
  openCreateNoteSheet(folder: {
    readonly path: string;
    readonly type: string;
    readonly sectionLabel: string;
  }): void {
    this.dialogFormService.openWizard(this.noteStep(folder));
  }

  /** The *New note* form as a wizard step: a title; confirming creates the note and opens it. */
  private noteStep(folder: {
    readonly path: string;
    readonly type: string;
    readonly sectionLabel: string;
  }): AppDialogWizardStep {
    return {
      title: this.translateService.instant('campaigns.sections.newNote.title'),
      okText: this.translateService.instant('campaigns.sections.newNote.submit'),
      fields: [NEW_NOTE_TITLE_FIELD],
      onSubmit: (form) => this.createNote(folder, String(form.getValues()['title'] ?? '')),
    };
  }

  /**
   * *Import from disk* into an Assets folder (`folder`, vault path), in a modal: a drop zone, paste, and the system
   * file dialog. `onImported` runs once files are saved (the page reloads its list).
   */
  openImportFromDiskDialog(folder: string, onImported?: () => void): void {
    this.dialogService.create<AppAssetImportSheetComponent, AssetImportSheetData>({
      arcTitle: this.translateService.instant('files.importFromDisk.title'),
      arcDescription: this.translateService.instant('files.importFromDisk.description', { folder }),
      arcContent: AppAssetImportSheetComponent,
      arcData: { folder, onImported },
      arcOkText: null,
      arcCancelText: this.translateService.instant('common.cancel'),
      arcCustomClasses: 'sm:max-w-lg',
    });
  }

  /**
   * *New…* without knowing the section yet: a small modal with the sections that can take a new file, then the
   * form of the one picked (a note's title, an encounter's name, a map's name and image). `campaignPath` is the
   * campaign's folder.
   */
  openCreateAnythingSheet(
    campaignPath: string,
    sections: readonly {
      readonly key: string;
      readonly type: string | null;
      readonly isSpecial: boolean;
      readonly label: string;
      readonly icon: SectionIcon;
    }[],
  ): void {
    const choices = sections.filter(
      (section) =>
        section.key === ENCOUNTERS_SECTION_KEY ||
        section.key === MAPS_SECTION_KEY ||
        (!!section.type && !section.isSpecial),
    );
    if (choices.length === 0) {
      return;
    }

    // Nothing to pick from: straight to the form of the only section.
    if (choices.length === 1) {
      this.openCreateInSection(campaignPath, choices[0]);
      return;
    }

    // Step 1 picks the section; confirming it shows that section's own form in the same modal.
    this.dialogFormService.openWizard({
      title: this.translateService.instant('campaigns.newAnything.title'),
      description: this.translateService.instant('campaigns.newAnything.description'),
      okText: this.translateService.instant('campaigns.newAnything.submit'),
      fields: [
        {
          id: 'section',
          type: 'select',
          label: 'campaigns.newAnything.sectionLabel',
          translate: true,
          required: true,
          value: choices[0].key,
          options: choices.map((section) => ({
            value: section.key,
            label: section.label,
            icon: section.icon,
          })),
        },
      ],
      onSubmit: async (form) => {
        const chosen = choices.find(
          (section) => section.key === String(form.getValues()['section'] ?? ''),
        );
        return chosen ? ((await this.stepForSection(campaignPath, chosen)) ?? false) : false;
      },
    });
  }

  /** The form that creates the first (or next) file of a section: a note, an encounter or a map. */
  openCreateInSection(
    campaignPath: string,
    section: {
      readonly key: string;
      readonly type: string | null;
      readonly isSpecial: boolean;
      readonly label: string;
    },
  ): void {
    void this.stepForSection(campaignPath, section).then((step) => {
      if (step) {
        this.dialogFormService.openWizard(step);
      }
    });
  }

  /** The create form of a section as a wizard step; null for a section that takes no new file. */
  private async stepForSection(
    campaignPath: string,
    section: {
      readonly key: string;
      readonly type: string | null;
      readonly isSpecial: boolean;
      readonly label: string;
    },
  ): Promise<AppDialogWizardStep | null> {
    const folderPath = `${campaignPath}/${section.key}`;
    if (section.key === ENCOUNTERS_SECTION_KEY) {
      return this.encounterStep(folderPath);
    }

    if (section.key === MAPS_SECTION_KEY) {
      return this.mapStep(folderPath);
    }

    if (section.type && !section.isSpecial) {
      return this.noteStep({ path: folderPath, type: section.type, sectionLabel: section.label });
    }

    return null;
  }

  /** *New encounter* in the Encounters section or one of its sub-folders (`folderPath`); opens the new encounter. */
  openCreateEncounterSheet(folderPath: string): void {
    this.dialogFormService.openWizard(this.encounterStep(folderPath));
  }

  /** The *New encounter* form as a wizard step: a name; confirming creates the encounter and opens it. */
  private encounterStep(folderPath: string): AppDialogWizardStep {
    return {
      title: this.translateService.instant('encounters.new.title'),
      okText: this.translateService.instant('encounters.new.submit'),
      fields: [NEW_ENCOUNTER_NAME_FIELD],
      onSubmit: (form) => this.createEncounter(folderPath, String(form.getValues()['name'] ?? '')),
    };
  }

  /**
   * *New map* in the Maps section or one of its sub-folders (`folderPath`): a name and one image of the scope's
   * assets. The image stays in assets/ (it can be imported there first); opens the new map.
   */
  async openCreateMapSheet(folderPath: string, selectedImage?: string): Promise<void> {
    this.dialogFormService.openWizard(await this.mapStep(folderPath, selectedImage));
  }

  /**
   * The *New map* form as a wizard step: a name and an image. Choosing "import from disk" in the image list
   * imports the file into the assets and refills this step with it chosen, without closing the modal.
   */
  private async mapStep(folderPath: string, selectedImage?: string): Promise<AppDialogWizardStep> {
    const scope = this.getScopeOf(folderPath);
    const images = (await this.documentService.listFolder(`${scope}/assets`)).filter((file) =>
      MAP_IMAGE_PATTERN.test(file.name),
    );

    const buildFields = (
      imageList: readonly { path: string; name: string }[],
    ): readonly AppSheetField[] => [
      NEW_MAP_NAME_FIELD,
      {
        id: 'image',
        type: 'combobox',
        label: 'maps.new.imageLabel',
        placeholder: 'maps.new.imagePlaceholder',
        searchPlaceholder: 'maps.new.imageSearch',
        emptyText: 'maps.new.imageEmpty',
        searchable: true,
        required: true,
        translate: true,
        options: [
          { value: IMPORT_IMAGE_CHOICE, label: 'maps.new.importFromDisk', translate: true },
          ...imageList.map((file) => ({ value: file.path, label: file.name })),
        ],
      },
    ];

    const step: AppDialogWizardStep = {
      title: this.translateService.instant('maps.new.title'),
      description: this.translateService.instant('maps.new.description'),
      okText: this.translateService.instant('maps.new.submit'),
      fields: buildFields(images),
      values: selectedImage ? { image: selectedImage } : undefined,
      onFieldChange: (fieldId, value, form) => {
        if (fieldId !== 'image' || value !== IMPORT_IMAGE_CHOICE) {
          return;
        }

        const name = form.getValue('name');
        void this.importMapImage(scope).then((saved) => {
          const imageList = saved
            ? [...images, { path: saved.path, name: saved.path.split('/').pop() ?? saved.path }]
            : images;
          form.setFields(buildFields(imageList), {
            name: typeof name === 'string' ? name : '',
            image: saved?.path ?? null,
          });
        });
      },
      onSubmit: (form) => {
        const values = form.getValues();
        return this.createMap(
          folderPath,
          String(values['name'] ?? ''),
          String(values['image'] ?? ''),
        );
      },
    };
    return step;
  }

  /** The campaign or compendium system a vault path belongs to (`lost-mine`, `compendium/my-system`). */
  private getScopeOf(path: string): string {
    const segments = path.split('/');
    return segments.slice(0, segments[0] === 'compendium' ? 2 : 1).join('/');
  }

  /** Lets the user pick one image on disk; it is saved into the scope's assets/ (null when cancelled). */
  private async importMapImage(scope: string): Promise<SavedAssetDto | null> {
    try {
      return await this.assetService.importImage(`${scope}/assets`);
    } catch (error) {
      toast.error(this.translateService.instant('maps.new.importError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
    const dialogRef = this.dialogFormService.open({
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
          void this.createFolder(section.path, String(form.getValues()['name'] ?? '')).then(
            (name) => {
              isSubmitting = false;
              if (name) {
                dialogRef.close();
                onCreated?.(name);
              }
            },
          );
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
      const message = error instanceof Error ? error.message : String(error);
      toast.error(this.translateService.instant('campaigns.sections.newNote.error'), {
        description: message.includes('already exists')
          ? this.translateService.instant('campaigns.sections.newNote.exists')
          : message,
      });
      return false;
    }
  }

  private async createEncounter(folderPath: string, name: string): Promise<boolean> {
    try {
      const encounter = await this.encounterService.create({ folder: folderPath, name });
      const route = toInAppEncounterRoute(encounter.path);
      if (route) {
        await this.router.navigateByUrl(route);
      }
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('encounters.new.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async createMap(folderPath: string, name: string, image: string): Promise<boolean> {
    try {
      const map = await this.mapService.create({ folder: folderPath, name, image });
      const route = toInAppMapRoute(map.path);
      if (route) {
        await this.router.navigateByUrl(route);
      }
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('maps.new.error'), {
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
    const dialogRef = this.dialogFormService.open({
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
              dialogRef.close();
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
   * *Rename…* a sub-folder of a section: the new name gives the folder slug, and the path
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
    const dialogRef = this.dialogFormService.open({
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
                dialogRef.close();
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
   * (default; links rewritten; a name taken there stops it, listed, the sheet stays open)
   * or **delete them too** (links to them turned into plain text / embeds removed, unless unticked). The
   * folder goes to the system Trash; tabs on its files follow them or go to the section page.
   */
  async openDeleteFolderSheet(
    folder: { readonly path: string; readonly label: string; readonly fileCount: number },
    onDeleted?: () => void,
  ): Promise<void> {
    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
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
                dialogRef.close();
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

  /**
   * A folder outside the sections (an unknown or too deep one) was deleted with its files: tabs showing one of
   * them go to the overview of their campaign or system, and the deleted notes are never saved back.
   */
  async followDeletedFolder(deletedPaths: readonly string[]): Promise<void> {
    for (const deletedPath of deletedPaths) {
      this.deletedPaths.add(deletedPath);
      const location = parseVaultFilePath(deletedPath);
      await this.followInTabs(
        toInAppNoteRoute(deletedPath) ?? toInAppAssetRoute(deletedPath),
        location?.scopeRoute ?? null,
      );
    }
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
  /**
   * *Edit* a map: its title and its image in one modal. Like a note, the title is what the user types: the file
   * takes its slug (`Skullport Dock` → `skullport-dock.json`), the title written in the file follows and links to
   * the file are updated. The image is one of the scope's assets, or one imported from disk into them; pins and
   * paths are fractions of the image, so they keep their place on a new one. Only what changed is saved.
   * `onSaved` gets the map's vault path afterwards (a new one when the title changed).
   */
  async openEditMapSheet(
    map: { readonly path: string },
    onSaved?: (path: string) => void | Promise<void>,
    draft?: { readonly title: string; readonly image: string },
  ): Promise<void> {
    let current: MapFileDto;
    try {
      current = await this.mapService.read(map.path);
    } catch (error) {
      toast.error(this.translateService.instant('maps.page.loadError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (current.parseError) {
      toast.error(this.translateService.instant('maps.page.parseError'), {
        description: current.parseError,
      });
      return;
    }

    const scope = this.getScopeOf(map.path);
    const images = (await this.documentService.listFolder(`${scope}/assets`)).filter((file) =>
      MAP_IMAGE_PATTERN.test(file.name),
    );
    const { backlinks, sourceTitles, preview } = await this.loadLinkingNotes(map.path);
    const fields: AppSheetField[] = [
      {
        id: 'title',
        type: 'input',
        label: 'document.rename.titleLabel',
        value: draft?.title ?? current.map.name,
        required: true,
        translate: true,
      },
      {
        id: 'image',
        type: 'combobox',
        label: 'maps.new.imageLabel',
        placeholder: 'maps.new.imagePlaceholder',
        searchPlaceholder: 'maps.new.imageSearch',
        emptyText: 'maps.new.imageEmpty',
        searchable: true,
        required: true,
        translate: true,
        value: draft?.image ?? current.map.image,
        options: [
          { value: IMPORT_IMAGE_CHOICE, label: 'maps.new.importFromDisk', translate: true },
          ...images.map((file) => ({ value: file.path, label: file.name })),
        ],
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
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('maps.edit.title'),
      arcDescription:
        sourceTitles.length > 0
          ? this.translateService.instant('document.rename.linkedFrom', { notes: preview })
          : this.translateService.instant('maps.edit.description'),
      arcOkText: this.translateService.instant('maps.item.save'),
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields,
      // Choosing "Import an image from disk…" opens the file dialog. The list of images is fixed when a sheet
      // opens, so the sheet is reopened with the saved image chosen and the title as typed so far.
      onFieldChange: (fieldId, value, form) => {
        if (fieldId === 'image' && value === IMPORT_IMAGE_CHOICE) {
          const title = String(form.getValues()['title'] ?? '');
          dialogRef.close();
          void this.importMapImage(scope).then((saved) =>
            this.openEditMapSheet(map, onSaved, {
              title,
              image: saved?.path ?? draft?.image ?? current.map.image ?? '',
            }),
          );
        }
      },
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.saveMapEdit(
            current,
            String(values['title'] ?? '').trim(),
            String(values['image'] ?? ''),
            values['updateLinks'] !== false,
            onSaved,
          ).then((isSaved) => {
            isSubmitting = false;
            if (isSaved) {
              dialogRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  /**
   * Saves a map edit: the file is renamed first when the title changed (links follow), then the title and the
   * image are written in the file at its final path.
   */
  private async saveMapEdit(
    current: MapFileDto,
    title: string,
    image: string,
    updateLinks: boolean,
    onSaved?: (path: string) => void | Promise<void>,
  ): Promise<boolean> {
    if (!title || !image || image === IMPORT_IMAGE_CHOICE) {
      return false;
    }

    try {
      let path = current.path;
      let linkCount = 0;
      let updatedCount = 0;
      if (title !== current.map.name) {
        const result = await this.documentService.renameAsset({ path, name: title, updateLinks });
        path = result.path;
        linkCount = result.linkCount;
        updatedCount = result.updatedPaths.length;
        if (result.failedPaths.length > 0) {
          toast.warning(this.translateService.instant('document.rename.failed'), {
            description: result.failedPaths.join(', '),
          });
        }
      }

      // A rename moved the file: read it at its new place, with the hash to check the write against.
      const file = path === current.path ? current : await this.mapService.read(path);
      if (file.map.name !== title || file.map.image !== image) {
        const result = await this.mapService.write({
          path,
          map: { ...file.map, name: title, image },
          expectedHash: file.contentHash,
        });
        if (result.status === 'conflict') {
          throw new Error(this.translateService.instant('maps.page.conflictTitle'));
        }
      }

      if (path !== current.path) {
        toast.success(
          this.translateService.instant('document.rename.done', {
            links: linkCount,
            notes: updatedCount,
          }),
        );
        await this.followInTabs(toInAppMapRoute(current.path), toInAppMapRoute(path));
      }

      await onSaved?.(path);
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('maps.edit.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async openRenameAssetSheet(
    file: Pick<DocumentFileListItemDto, 'path' | 'name'> & { readonly label?: string },
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
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('campaigns.sections.renameAsset.title', {
        name: file.label ?? file.name,
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
              dialogRef.close();
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
    const dialogRef = this.dialogFormService.open({
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
              dialogRef.close();
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
