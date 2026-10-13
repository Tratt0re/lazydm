import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';
import { map } from 'rxjs';

import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import { findSection } from '@/config/menu.config';
import type { DocumentFileListItemDto, TemplateDto, TemplateRulesDto } from '@/dtos';
import { AppSheetService } from '@/services/app-sheet.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { CopyToService } from '@/services/copy-to.service';
import { DocumentService } from '@/services/document.service';
import {
  AUTOMATIC_TEMPLATE_RULE,
  TemplateService,
} from '@/services/template.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

export const CAMPAIGN_SECTION_PARAM = 'section';

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
    RouterLink,
    TranslatePipe,
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
  private loadToken = 0;

  protected readonly section = computed(() => findSection(this.sectionKey()));
  protected readonly sectionLabelKey = computed(() => `nav.items.${this.sectionKey()}`);
  protected readonly folderPath = computed(() => `${this.scope()?.rootPath ?? ''}/${this.sectionKey()}`);
  protected readonly scopeRoute = computed(() => this.scope()?.routeBase ?? '');
  protected readonly importLabel = computed(() =>
    this.scope()?.kind === 'system' ? 'compendium.import.fromCampaign' : 'compendium.import.fromCompendium',
  );

  protected readonly files = signal<readonly DocumentFileListItemDto[]>([]);
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

      void this.loadFiles(`${scope.rootPath}/${section.key}`);
    });

    effect((onCleanup) => {
      const scope = this.scope();
      const section = this.section();
      if (!scope || !section) {
        return;
      }

      onCleanup(
        this.toolbarContext.activate({
          title: this.sectionLabelKey(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [{ label: scope.name, path: scope.routeBase, translate: false }],
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
    const noteType = section?.noteType ?? null;
    const actions: ToolbarItemAction[] = [];

    if (scope?.kind === 'campaign' && noteType && this.templateTypes().includes(noteType)) {
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

    if (noteType) {
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

  protected toNoteSlug(file: DocumentFileListItemDto): string {
    return file.name;
  }

  /** Copies a file of the same folder from the other side (compendium ↔ campaign) into this folder. */
  protected openImportSheet(): void {
    const scope = this.scope();
    const section = this.section();
    if (scope && section) {
      void this.copyTo.openImportSheet(scope, section.key, () => void this.loadFiles(this.folderPath()));
    }
  }

  protected openCreateSheet(): void {
    const section = this.section();
    if (!section?.noteType) {
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
          void this.createNote(String(form.getValues()['title'] ?? ''), section.noteType ?? '').then((created) => {
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
        section: this.translateService.instant(this.sectionLabelKey()),
      });
      const noteSlug = note.path.split('/').pop()!.replace(/\.md$/i, '');
      await this.router.navigateByUrl(`${this.scopeRoute()}/${this.sectionKey()}/${noteSlug}`);
      return true;
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async loadFiles(folder: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const rows = await this.documentService.listFolder(folder);
      if (token === this.loadToken) {
        this.files.set(rows);
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
