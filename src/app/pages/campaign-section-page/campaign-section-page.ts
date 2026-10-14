import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';
import { map } from 'rxjs';

import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import type {
  DocumentFileListItemDto,
  DocumentFolderDto,
  TemplateDto,
  TemplateRulesDto,
} from '@/dtos';
import { AppSheetService } from '@/services/app-sheet.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { CopyToService } from '@/services/copy-to.service';
import { DocumentService } from '@/services/document.service';
import { FileMoveService, type MoveSection } from '@/services/file-move.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import {
  AUTOMATIC_TEMPLATE_RULE,
  TemplateService,
} from '@/services/template.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

export const CAMPAIGN_SECTION_PARAM = 'section';
/** Query parameter of the sub-folder the section page shows (`?folder=humans`). */
export const SECTION_FOLDER_QUERY_PARAM = 'folder';

/** A sub-folder of the section with the files directly in it. */
interface SectionTreeFolder extends DocumentFolderDto {
  readonly files: readonly DocumentFileListItemDto[];
}

const NEW_NOTE_TITLE_FIELD: AppSheetField = {
  id: 'title',
  type: 'input',
  label: 'campaigns.sections.newNote.titleLabel',
  placeholder: 'campaigns.sections.newNote.titlePlaceholder',
  required: true,
  translate: true,
};

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
  private readonly sheetFormService = inject(AppSheetFormService);
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
    this.scope()?.kind === 'system' ? 'compendium.import.fromCampaign' : 'compendium.import.fromCompendium',
  );

  /** The section folder (`<scope>/<section>`), whatever sub-folder is open. */
  private readonly sectionPath = computed(() => `${this.scope()?.rootPath ?? ''}/${this.sectionKey()}`);
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
  private readonly fileMove = inject(FileMoveService);
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
    const hasTemplates = noteType !== null && (this.templateTypes().includes(noteType) || section?.isCustom);
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
    return this.copyTo.isInCompendium(file.path) ? 'compendium.copy.toCampaign' : 'compendium.copy.toCompendium';
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
    event.preventDefault();
    const path = this.draggedPath();
    this.onDragEnd();
    if (path) {
      void this.moveFile(path, target);
    }
  }

  // --- Right-click menu ------------------------------------------------------------------------------

  /** Move to the section itself or one of its sub-folders. */
  protected openMoveSheet(file: DocumentFileListItemDto): void {
    this.fileMove.openMoveSheet(file, this.moveSection(), () => void this.loadTree(this.sectionPath()));
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

  /** New sub-folder of the section, then opens it. */
  protected openCreateFolderSheet(): void {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('campaigns.sections.newFolder.title'),
      arcDescription: this.translateService.instant(
        this.section()?.isSpecial
          ? 'campaigns.sections.newFolder.specialDescription'
          : 'campaigns.sections.newFolder.description',
        { section: this.sectionLabel() },
      ),
      arcOkText: this.translateService.instant('campaigns.sections.newFolder.submit'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'campaigns.sections.newFolder.nameLabel',
          placeholder: 'campaigns.sections.newFolder.namePlaceholder',
          required: true,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.createFolder(String(form.getValues()['name'] ?? '')).then((isCreated) => {
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

  /** Copies a file of the same folder from the other side (compendium ↔ campaign) into this folder. */
  protected openImportSheet(): void {
    const scope = this.scope();
    const section = this.section();
    if (scope && section) {
      void this.copyTo.openImportSheet(scope, section.key, () => void this.loadTree(this.sectionPath()));
    }
  }

  protected openCreateSheet(): void {
    const section = this.section();
    if (!section?.type) {
      return;
    }

    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('campaigns.sections.newNote.title'),
      arcOkText: this.translateService.instant('campaigns.sections.newNote.submit'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [NEW_NOTE_TITLE_FIELD],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.createNote(String(form.getValues()['title'] ?? ''), section.type ?? '').then((created) => {
            isSubmitting = false;
            if (created) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  private async createNote(title: string, type: string): Promise<boolean> {
    try {
      const note = await this.documentService.create({
        folder: this.folderPath(),
        title,
        type,
        section: this.sectionLabel(),
      });
      await this.router.navigateByUrl(toInAppNoteRoute(note.path) ?? this.scopeRoute());
      return true;
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async createFolder(name: string): Promise<boolean> {
    const section = this.section();
    if (!section) {
      return false;
    }

    try {
      const folder = await this.documentService.createFolder(this.folderPath(), name);
      await this.router.navigate([this.scopeRoute(), section.key], {
        queryParams: { [SECTION_FOLDER_QUERY_PARAM]: folder },
      });
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.sections.newFolder.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
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
