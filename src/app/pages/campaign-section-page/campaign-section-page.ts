import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';
import { map } from 'rxjs';

import {
  AppAssetImportSheetComponent,
  type AssetImportSheetData,
} from '@/components/asset-import-sheet/asset-import-sheet.component';
import {
  toAssetUrl,
  toInAppAssetRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import type {
  DocumentFileListItemDto,
  DocumentFolderDto,
  TemplateDto,
  TemplateRulesDto,
} from '@/dtos';
import { AppSheetService } from '@/services/app-sheet.service';
import { AssetService } from '@/services/asset.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { CopyToService } from '@/services/copy-to.service';
import { DocumentService } from '@/services/document.service';
import { FileActionsService } from '@/services/file-actions.service';
import { FileMoveService, type MoveSection } from '@/services/file-move.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { AUTOMATIC_TEMPLATE_RULE, TemplateService } from '@/services/template.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechSheetService } from '@/shared/components/sheet';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

export const CAMPAIGN_SECTION_PARAM = 'section';
/** Query parameter of the sub-folder the section page shows (`?folder=humans`). */
export const SECTION_FOLDER_QUERY_PARAM = 'folder';
/** The Assets section (any non-note file): files from the file manager can be imported or dropped there. */
const ASSETS_SECTION_KEY = 'assets';

/** A sub-folder of the section with the files directly in it. */
interface SectionTreeFolder extends DocumentFolderDto {
  readonly files: readonly DocumentFileListItemDto[];
}

function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }

  const sizeInKb = sizeInBytes / 1024;
  return sizeInKb < 1024 ? `${sizeInKb.toFixed(1)} KB` : `${(sizeInKb / 1024).toFixed(1)} MB`;
}

@Component({
  selector: 'app-campaign-section-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
    ArcTechMenuImports,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechTooltipImports,
  ],
  templateUrl: './campaign-section-page.html',
})
export class CampaignSectionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** A campaign, or a compendium system (the same page lists both). */
  private readonly scope = inject(NoteScopeService).scopeOf(getNoteScopeKind(this.route));
  private readonly documentService = inject(DocumentService);
  private readonly translateService = inject(TranslateService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly templateService = inject(TemplateService);
  private readonly appSheetService = inject(AppSheetService);
  protected readonly copyTo = inject(CopyToService);

  /** Templates and the campaign's choices, for the template select of the toolbar (campaigns only). */
  private readonly templates = signal<readonly TemplateDto[]>([]);
  private readonly templateTypes = signal<readonly string[]>([]);
  private readonly templateRules = signal<TemplateRulesDto>({});

  private readonly sectionKey = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(CAMPAIGN_SECTION_PARAM) ?? '')),
    { initialValue: '' },
  );
  /** Sub-folder shown (one level inside the section), from `?folder=`; null shows the section itself. */
  protected readonly subfolder = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get(SECTION_FOLDER_QUERY_PARAM)?.trim() || null),
    ),
    { initialValue: null },
  );
  private loadToken = 0;

  private readonly sectionService = inject(SectionService);
  protected readonly section = computed(() =>
    this.scope()?.kind === 'system'
      ? this.sectionService.findSystemSection(this.sectionKey())
      : this.sectionService.findCampaignSection(this.sectionKey()),
  );
  /** Display name of the section (its custom name, else the translated one). */
  protected readonly sectionLabel = computed(() => {
    const section = this.section();
    return section ? this.sectionService.labelOf(section) : this.sectionKey();
  });
  /** Name the page shows: the sub-folder's when one is open, else the section's. */
  protected readonly pageLabel = computed(() => {
    const subfolder = this.subfolder();
    return subfolder ? toSubfolderLabel(subfolder) : this.sectionLabel();
  });
  protected readonly folderPath = computed(() => {
    const sectionPath = `${this.scope()?.rootPath ?? ''}/${this.sectionKey()}`;
    const subfolder = this.subfolder();
    return subfolder ? `${sectionPath}/${subfolder}` : sectionPath;
  });
  protected readonly scopeRoute = computed(() => this.scope()?.routeBase ?? '');
  protected readonly importLabel = computed(() =>
    this.scope()?.kind === 'system'
      ? 'compendium.import.fromCampaign'
      : 'compendium.import.fromCompendium',
  );

  /** The section folder (`<scope>/<section>`), whatever sub-folder is open. */
  private readonly sectionPath = computed(
    () => `${this.scope()?.rootPath ?? ''}/${this.sectionKey()}`,
  );
  private readonly tree = signal<{
    files: readonly DocumentFileListItemDto[];
    folders: readonly SectionTreeFolder[];
  }>({ files: [], folders: [] });
  /** Files shown: those of the open sub-folder, else those directly in the section. */
  protected readonly files = computed(() => {
    const subfolder = this.subfolder();
    const tree = this.tree();
    return subfolder
      ? (tree.folders.find((folder) => folder.name === subfolder)?.files ?? [])
      : tree.files;
  });
  /** Sub-folders listed (collapsible, with their files); none inside a sub-folder (one level only). */
  protected readonly folders = computed(() => (this.subfolder() ? [] : this.tree().folders));
  protected readonly expandedFolders = signal<ReadonlySet<string>>(new Set());
  /** File being dragged, and the folder it would land in (`''`: the section itself). */
  protected readonly draggedPath = signal<string | null>(null);
  protected readonly dropTarget = signal<string | null>(null);
  /** Files from the file manager dragged over the Assets section page (not over a sub-folder row). */
  protected readonly isFileDragOverPage = signal(false);
  protected readonly isAssetsSection = computed(() => this.section()?.key === ASSETS_SECTION_KEY);
  private readonly fileMove = inject(FileMoveService);
  private readonly fileActions = inject(FileActionsService);
  private readonly sheetService = inject(ArcTechSheetService);
  private readonly assetService = inject(AssetService);
  protected readonly revealLabel = this.fileMove.revealLabel;
  protected readonly toSubfolderLabel = toSubfolderLabel;
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatFileSize = formatFileSize;

  constructor() {
    effect((onCleanup) => {
      const scope = this.scope();
      const section = this.section();
      if (!scope) {
        return;
      }

      if (!section) {
        void this.router.navigateByUrl(scope.routeBase);
        return;
      }

      void this.loadTree(this.sectionPath());
    });

    effect((onCleanup) => {
      const scope = this.scope();
      const section = this.section();
      if (!scope || !section) {
        return;
      }

      onCleanup(
        this.toolbarContext.activate({
          title: this.pageLabel(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: scope.name, path: scope.routeBase, translate: false },
            ...(this.subfolder()
              ? [
                  {
                    label: this.sectionLabel(),
                    path: `${scope.routeBase}/${section.key}`,
                    translate: false,
                  },
                ]
              : []),
          ],
          itemActions: this.buildToolbarActions(),
        }),
      );
    });

    // Template choices can change in the Templates sheet or in Settings: reload when no sheet is over the page.
    effect(() => {
      const scope = this.scope();
      if (scope?.kind === 'campaign' && this.appSheetService.activeKind() === null) {
        void this.loadTemplates(scope.rootPath);
      }
    });
  }

  /** Template select (campaign folders of a note type), Import, New note. */
  private buildToolbarActions(): readonly ToolbarItemAction[] {
    const scope = this.scope();
    const section = this.section();
    const noteType = section?.type ?? null;
    const actions: ToolbarItemAction[] = [];

    // Custom sections have no built-in of their own but can still pick a template.
    const hasTemplates =
      noteType !== null && (this.templateTypes().includes(noteType) || section?.isCustom);
    if (scope?.kind === 'campaign' && noteType && hasTemplates) {
      const campaign = scope.rootPath;
      actions.push({
        id: 'section-template',
        type: 'select',
        label: 'campaigns.sections.template.label',
        ariaLabel: this.translateService.instant('campaigns.sections.template.ariaLabel'),
        class: 'w-56',
        value: () => this.templateRules()[noteType] ?? AUTOMATIC_TEMPLATE_RULE,
        options: this.templateService.getRuleOptions(
          this.templates(),
          campaign,
          this.templateRules()[noteType],
        ),
        change: (value) => this.setTemplateRule(campaign, noteType, value),
      });
    }

    if (section?.key === ASSETS_SECTION_KEY) {
      actions.push({
        id: 'section-import-disk',
        label: 'files.importFromDisk.button',
        icon: 'file-up',
        buttonType: 'outline',
        action: () => this.openImportFromDiskSheet(),
      });
    }

    actions.push({
      id: 'section-import',
      label: this.importLabel(),
      icon: 'library-big',
      buttonType: 'outline',
      action: () => this.openImportSheet(),
    });

    // One level of sub-folders: sub-types of a section's notes, plain folders in special sections.
    if ((noteType || section?.isSpecial) && !this.subfolder()) {
      actions.push({
        id: 'section-new-folder',
        label: 'campaigns.sections.newFolder.button',
        icon: 'folder',
        buttonType: 'outline',
        action: () => this.openCreateFolderSheet(),
      });
    }

    if (noteType && !section?.isSpecial) {
      actions.push({
        id: 'section-new-note',
        label: 'campaigns.sections.newNote.create',
        icon: 'plus',
        action: () => this.openCreateSheet(),
      });
    }

    return actions;
  }

  private async setTemplateRule(campaign: string, type: string, value: string): Promise<void> {
    if (value === (this.templateRules()[type] ?? AUTOMATIC_TEMPLATE_RULE)) {
      return;
    }

    try {
      this.templateRules.set(
        await this.templateService.setRule(
          campaign,
          type,
          value === AUTOMATIC_TEMPLATE_RULE ? null : value,
        ),
      );
      toast.success(this.translateService.instant('settings.templates.rules.saved'));
    } catch (error) {
      toast.error(this.translateService.instant('settings.templates.rules.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadTemplates(campaign: string): Promise<void> {
    try {
      const [library, rules] = await Promise.all([
        this.templateService.list(),
        this.templateService.getRules(campaign),
      ]);
      this.templates.set(library.rows);
      this.templateTypes.set(library.types);
      this.templateRules.set(rules);
    } catch (error) {
      console.warn('[app] Failed to load the templates:', campaign, error);
    }
  }

  /** Label of the copy action of this page's files: to the compendium, or (inside a system) to a campaign. */
  protected copyLabel(file: DocumentFileListItemDto): string {
    return this.copyTo.isInCompendium(file.path)
      ? 'compendium.copy.toCampaign'
      : 'compendium.copy.toCompendium';
  }

  protected isExpanded(name: string): boolean {
    return this.expandedFolders().has(name);
  }

  protected toggleFolder(name: string): void {
    const next = new Set(this.expandedFolders());
    if (!next.delete(name)) {
      next.add(name);
    }
    this.expandedFolders.set(next);
  }

  // --- Drag a file onto a sub-folder (or the section itself) to move it there ------------------------

  protected onDragStart(event: DragEvent, file: DocumentFileListItemDto): void {
    event.dataTransfer?.setData('text/plain', file.path);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.draggedPath.set(file.path);
  }

  protected onDragEnd(): void {
    this.draggedPath.set(null);
    this.dropTarget.set(null);
  }

  protected onDragOver(event: DragEvent, target: string): void {
    if (this.isFileDrop(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer!.dropEffect = 'copy';
      this.isFileDragOverPage.set(false);
      this.dropTarget.set(target);
      return;
    }

    const path = this.draggedPath();
    if (path && this.folderOf(path) !== target) {
      event.preventDefault();
      this.dropTarget.set(target);
    }
  }

  protected onDragLeave(target: string): void {
    if (this.dropTarget() === target) {
      this.dropTarget.set(null);
    }
  }

  protected onDrop(event: DragEvent, target: string): void {
    if (this.isFileDrop(event)) {
      event.preventDefault();
      event.stopPropagation();
      this.dropTarget.set(null);
      void this.saveDroppedFiles(event, this.folderPathOf(target));
      return;
    }

    event.preventDefault();
    const path = this.draggedPath();
    this.onDragEnd();
    if (path) {
      void this.moveFile(path, target);
    }
  }

  // --- Files from the file manager dropped on the Assets section -----------------------------------

  /** Files dragged anywhere on the page go to the folder it shows (sub-folder rows take their own). */
  protected onPageDragOver(event: DragEvent): void {
    if (this.isFileDrop(event)) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
      this.isFileDragOverPage.set(true);
    }
  }

  protected onPageDragLeave(event: DragEvent): void {
    // Leaving for a child of the page is not leaving the page.
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      this.isFileDragOverPage.set(false);
    }
  }

  protected onPageDrop(event: DragEvent): void {
    if (this.isFileDrop(event)) {
      event.preventDefault();
      this.isFileDragOverPage.set(false);
      void this.saveDroppedFiles(event, this.folderPath());
    }
  }

  /** *Import from disk* (Assets section): a sheet with a drop zone and *Select files*, into this folder. */
  protected openImportFromDiskSheet(): void {
    this.sheetService.create<AppAssetImportSheetComponent, AssetImportSheetData>({
      arcTitle: this.translateService.instant('files.importFromDisk.title'),
      arcDescription: this.translateService.instant('files.importFromDisk.description', {
        folder: this.folderPath(),
      }),
      arcContent: AppAssetImportSheetComponent,
      arcData: {
        folder: this.folderPath(),
        onImported: () => void this.loadTree(this.sectionPath()),
      },
      arcOkText: null,
      arcCancelText: this.translateService.instant('document.rename.cancel'),
    });
  }

  /** Files from the file manager on the Assets section (a row being moved is not one of those). */
  private isFileDrop(event: DragEvent): boolean {
    return (
      this.isAssetsSection() &&
      this.draggedPath() === null &&
      !!event.dataTransfer?.types.includes('Files')
    );
  }

  private async saveDroppedFiles(event: DragEvent, folder: string): Promise<void> {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0 && (await this.fileActions.saveMediaToFolder(folder, files))) {
      await this.loadTree(this.sectionPath());
    }
  }

  // --- Right-click menu ------------------------------------------------------------------------------

  /** Move to the section itself or one of its sub-folders. */
  protected openMoveSheet(file: DocumentFileListItemDto): void {
    this.fileMove.openMoveSheet(
      file,
      this.moveSection(),
      () => void this.loadTree(this.sectionPath()),
    );
  }

  /** *Rename* an asset (the extension stays); the list reloads with its new name. */
  protected openRenameAssetSheet(file: DocumentFileListItemDto): void {
    void this.fileActions.openRenameAssetSheet(file, () => void this.loadTree(this.sectionPath()));
  }

  /** *Rename…* from the right-click menu: a note (its title, links updated) or an asset. */
  protected openRenameSheet(file: DocumentFileListItemDto): void {
    if (file.kind !== 'md') {
      this.openRenameAssetSheet(file);
      return;
    }

    void this.fileActions.openRenameNoteSheet(
      { path: file.path, title: file.title },
      () => void this.loadTree(this.sectionPath()),
    );
  }

  /** *Rename…* a sub-folder (sub-type and links follow); it stays expanded under its new name. */
  protected openRenameFolderSheet(folder: DocumentFolderDto): void {
    void this.fileActions.openRenameFolderSheet(
      {
        path: this.folderPathOf(folder.name),
        label: toSubfolderLabel(folder.name),
        fileCount: folder.fileCount,
      },
      (name) => {
        const expanded = new Set(this.expandedFolders());
        if (expanded.delete(folder.name)) {
          expanded.add(name);
          this.expandedFolders.set(expanded);
        }
        void this.loadTree(this.sectionPath());
      },
    );
  }

  /** *Delete…* a sub-folder (its files moved to the main folder, or deleted too); the list reloads. */
  protected openDeleteFolderSheet(folder: DocumentFolderDto): void {
    void this.fileActions.openDeleteFolderSheet(
      {
        path: this.folderPathOf(folder.name),
        label: toSubfolderLabel(folder.name),
        fileCount: folder.fileCount,
      },
      () => void this.loadTree(this.sectionPath()),
    );
  }

  /** *Delete…* a note or an asset (to the system Trash), after a confirmation; the list reloads. */
  protected openDeleteSheet(file: DocumentFileListItemDto): void {
    const isNote = file.kind === 'md';
    void this.fileActions.openDeleteSheet(
      { path: file.path, label: isNote ? file.title : file.name, isNote },
      () => void this.loadTree(this.sectionPath()),
    );
  }

  /** Thumbnail of an image asset (served by the asset protocol); null for anything else. */
  protected thumbnailUrl(file: DocumentFileListItemDto): string | null {
    return this.assetService.getAssetKind(file.path) === 'image' ? toAssetUrl(file.path) : null;
  }

  /** Asset page of an image of the list. */
  protected assetRoute(file: DocumentFileListItemDto): string {
    return toInAppAssetRoute(file.path) ?? this.scopeRoute();
  }

  /** Icon of a non-image file of the list: PDF, audio, anything else. */
  protected assetIcon(file: DocumentFileListItemDto): ArcTechIcon {
    const kind = this.assetService.getAssetKind(file.path);
    return kind === 'pdf' ? 'file-text' : kind === 'audio' ? 'file-music' : 'file';
  }

  protected reveal(path: string): void {
    this.fileMove.reveal(path);
  }

  protected folderPathOf(name: string): string {
    return `${this.sectionPath()}/${name}`;
  }

  protected noteRoute(file: DocumentFileListItemDto): string {
    return toInAppNoteRoute(file.path) ?? this.scopeRoute();
  }

  /** New sub-folder of the section; the page stays where it is, with the new sub-folder expanded. */
  protected openCreateFolderSheet(): void {
    this.fileActions.openCreateFolderSheet(
      {
        path: this.sectionPath(),
        label: this.sectionLabel(),
        isSpecial: this.section()?.isSpecial ?? false,
      },
      (name) => {
        this.expandedFolders.set(new Set(this.expandedFolders()).add(name));
        void this.loadTree(this.sectionPath());
      },
    );
  }

  /** Copies a file of the same folder from the other side (compendium ↔ campaign) into this folder. */
  protected openImportSheet(): void {
    const scope = this.scope();
    const section = this.section();
    if (scope && section) {
      void this.copyTo.openImportSheet(
        scope,
        section.key,
        () => void this.loadTree(this.sectionPath()),
      );
    }
  }

  /** Whether the section's folders take new notes (not the special sections: assets, encounters). */
  protected readonly canCreateNote = computed(() => {
    const section = this.section();
    return !!section?.type && !section.isSpecial;
  });

  /** *New note* in the folder shown, or in one of its sub-folders (folder right-click menu). */
  protected openCreateSheet(subfolder: string | null = this.subfolder()): void {
    const section = this.section();
    if (!section?.type || section.isSpecial) {
      return;
    }

    this.fileActions.openCreateNoteSheet({
      path: subfolder ? this.folderPathOf(subfolder) : this.sectionPath(),
      type: section.type,
      sectionLabel: this.sectionLabel(),
    });
  }

  /** Sub-folder a file of the section is in (`''` directly in the section). */
  private folderOf(path: string): string {
    return this.fileMove.folderOf(path, this.sectionPath());
  }

  private moveSection(): MoveSection {
    return {
      path: this.sectionPath(),
      label: this.sectionLabel(),
      folders: this.tree().folders.map((folder) => folder.name),
    };
  }

  private async moveFile(path: string, target: string): Promise<void> {
    if (await this.fileMove.move(path, this.moveSection(), target)) {
      await this.loadTree(this.sectionPath());
    }
  }

  private async loadTree(sectionPath: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const tree = await this.documentService.listSectionTree(sectionPath);
      if (token === this.loadToken) {
        this.tree.set(tree);
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
}
