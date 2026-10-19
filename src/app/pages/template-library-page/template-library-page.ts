import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  AppCodeEditorComponent,
  type CodeEditorMode,
} from '@/components/code-editor/code-editor.component';
import {
  AppSecondarySidebarComponent,
  type SecondarySidebarItem,
} from '@/components/secondary-sidebar/secondary-sidebar.component';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { TemplateDto } from '@/dtos';
import { AppSheetService } from '@/services/app-sheet.service';
import { DocumentService } from '@/services/document.service';
import { type AppSection, SectionService } from '@/services/section.service';
import { TemplateService } from '@/services/template.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const BUILT_IN_KEY_PREFIX = 'builtin:';
const GROUP_KEY_PREFIX = 'group:';
const PLACEHOLDERS = ['title', 'date', 'time', 'campaign', 'section', 'type'] as const;
/** "Start from" value of an empty new template. */
const EMPTY_START = 'empty';
const SOURCE_ICONS: Record<TemplateDto['source'], ArcTechIcon> = {
  vault: 'vault',
  system: 'library-big',
  campaign: 'scroll-text',
};

interface NoteTypeRow {
  readonly type: string;
  readonly sectionKey: string;
  /** Display name of the section. */
  readonly label: string;
}

interface SelectedTemplate {
  /** Template path, or `builtin:<type>` for a read-only built-in. */
  readonly key: string;
  readonly content: string;
  readonly contentHash: string | null;
}

/**
 * The Templates sheet: every template of the vault (built-ins, the vault's `_templates/`, each compendium
 * system's and each campaign's) in the shared secondary sidebar, edited with the note editor. When the
 * sheet is over a campaign, its custom sections' types are offered to start a template from.
 */
@Component({
  selector: 'app-template-library-page',
  imports: [
    TranslatePipe,
    AppCodeEditorComponent,
    AppSecondarySidebarComponent,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './template-library-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class TemplateLibraryPage implements OnInit {
  private readonly templateService = inject(TemplateService);
  private readonly documentService = inject(DocumentService);
  private readonly appSheetService = inject(AppSheetService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly sectionService = inject(SectionService);

  protected readonly placeholders = PLACEHOLDERS.map((name) => `{{${name}}}`);
  protected readonly editorModes: readonly {
    value: CodeEditorMode;
    label: string;
    icon: ArcTechIcon;
  }[] = [
    { value: 'live', label: 'document.toolbar.live', icon: 'pencil-line' },
    { value: 'source', label: 'document.toolbar.source', icon: 'code' },
  ];

  protected readonly templates = signal<readonly TemplateDto[]>([]);
  protected readonly types = signal<readonly string[]>([]);
  protected readonly selected = signal<SelectedTemplate | null>(null);
  protected readonly editedContent = signal('');
  protected readonly editorMode = signal<CodeEditorMode>('source');
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Campaign of the page under the sheet (`/campaigns/<slug>/…`), or null on the campaign list. */
  private readonly campaignSlug = signal<string | null>(null);

  /** Sections of the campaign under the sheet (custom ones included); the defaults without a campaign. */
  private readonly campaignSections = signal<readonly AppSection[] | null>(null);
  protected readonly noteTypes = computed<readonly NoteTypeRow[]>(() =>
    (this.campaignSections() ?? this.sectionService.systemSections())
      .filter((section) => section.type !== null && this.types().includes(section.type))
      .map((section) => ({
        type: section.type!,
        sectionKey: section.key,
        label: this.sectionService.labelOf(section),
      })),
  );

  protected readonly libraryItems = computed<readonly SecondarySidebarItem[]>(() => {
    const builtIns: SecondarySidebarItem = {
      key: `${GROUP_KEY_PREFIX}builtin`,
      label: 'settings.templates.sources.builtin',
      icon: 'lock',
      children: this.noteTypes().map((row) => ({
        key: `${BUILT_IN_KEY_PREFIX}${row.type}`,
        label: row.label,
        translate: false,
      })),
    };

    const groups = new Map<
      string,
      { label: string; translate: boolean; icon: ArcTechIcon; rows: TemplateDto[] }
    >();
    for (const template of this.templates()) {
      const groupKey = template.scope ?? 'vault';
      const group = groups.get(groupKey) ?? {
        label: template.scopeName ?? 'settings.templates.sources.vault',
        translate: template.scopeName === null,
        icon: SOURCE_ICONS[template.source],
        rows: [],
      };
      group.rows.push(template);
      groups.set(groupKey, group);
    }

    return [
      builtIns,
      ...[...groups.entries()].map(([groupKey, group]) => ({
        key: `${GROUP_KEY_PREFIX}${groupKey}`,
        label: group.label,
        translate: group.translate,
        icon: group.icon,
        children: group.rows.map((template) => ({
          key: template.path,
          label: template.name,
          translate: false,
          description: template.path,
        })),
      })),
    ];
  });

  protected readonly selectedBuiltInType = computed(() => {
    const key = this.selected()?.key ?? '';
    return key.startsWith(BUILT_IN_KEY_PREFIX) ? key.slice(BUILT_IN_KEY_PREFIX.length) : null;
  });
  protected readonly selectedTemplate = computed(
    () => this.templates().find((template) => template.path === this.selected()?.key) ?? null,
  );
  protected readonly selectedTitle = computed(() => {
    const type = this.selectedBuiltInType();
    if (type) {
      return this.noteTypes().find((row) => row.type === type)?.label ?? type;
    }

    return this.selectedTemplate()?.name ?? '';
  });
  protected readonly isDirty = computed(() => {
    const selected = this.selected();
    return (
      selected !== null && !this.selectedBuiltInType() && this.editedContent() !== selected.content
    );
  });

  constructor() {
    // Leaving the sheet saves pending edits, like leaving a note.
    inject(DestroyRef).onDestroy(() => void this.save());
  }

  ngOnInit(): void {
    this.campaignSlug.set(this.readCampaignSlug());
    void this.load();
  }

  /** Library selection; unsaved edits of the current template are saved first (like leaving a note). */
  protected async onLibrarySelected(item: SecondarySidebarItem): Promise<void> {
    if (item.key === this.selected()?.key || item.key.startsWith(GROUP_KEY_PREFIX)) {
      return;
    }

    if (this.isDirty() && !(await this.save())) {
      return;
    }

    await this.select(item.key);
  }

  protected async save(): Promise<boolean> {
    const selected = this.selected();
    if (!selected || this.selectedBuiltInType() || this.isSaving()) {
      return false;
    }

    if (!this.isDirty()) {
      return true;
    }

    this.isSaving.set(true);
    const content = this.editedContent();
    try {
      const result = await this.documentService.write({
        path: selected.key,
        content,
        expectedHash: selected.contentHash,
      });
      if (result.status === 'conflict') {
        toast.error(this.translateService.instant('settings.templates.editor.conflict'), {
          action: {
            label: this.translateService.instant('settings.templates.editor.reload'),
            onClick: () => void this.select(selected.key),
          },
        });
        return false;
      }

      this.selected.set({ ...selected, content, contentHash: result.contentHash });
      toast.success(this.translateService.instant('settings.templates.editor.saved'));
      return true;
    } catch (error) {
      this.showError('settings.templates.editor.saveError', error);
      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  protected openCreateSheet(): void {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('settings.templates.create.title'),
      arcDescription: this.translateService.instant('settings.templates.create.description'),
      arcOkText: this.translateService.instant('settings.templates.create.submit'),
      arcCancelText: this.translateService.instant('settings.templates.create.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'settings.templates.create.nameLabel',
          placeholder: 'settings.templates.create.namePlaceholder',
          required: true,
          translate: true,
        },
        {
          id: 'startFrom',
          type: 'select',
          label: 'settings.templates.create.startFromLabel',
          value: EMPTY_START,
          translate: true,
          options: [
            {
              value: EMPTY_START,
              label: this.translateService.instant('settings.templates.create.empty'),
            },
            ...this.noteTypes().map((row) => ({
              value: row.type,
              label: this.translateService.instant('settings.templates.create.fromBuiltIn', {
                section: row.label,
              }),
            })),
          ],
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          const startFrom = String(values['startFrom'] ?? EMPTY_START);
          const type = startFrom === EMPTY_START ? null : startFrom;
          void this.create(String(values['name'] ?? ''), type).then((isDone) => {
            isSubmitting = false;
            if (isDone) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  /** Copies the selected built-in into `_templates/` and opens the copy. */
  protected async customize(): Promise<void> {
    const type = this.selectedBuiltInType();
    if (!type) {
      return;
    }

    try {
      const path = await this.templateService.customize(type);
      await this.load();
      await this.select(path);
      toast.success(this.translateService.instant('settings.templates.customized', { path }));
    } catch (error) {
      this.showError('settings.templates.createError', error);
    }
  }

  protected confirmDelete(): void {
    const template = this.selectedTemplate();
    if (!template) {
      return;
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('settings.templates.delete.title', {
        name: template.name,
      }),
      arcDescription: this.translateService.instant('settings.templates.delete.description', {
        path: template.path,
      }),
      arcOkText: this.translateService.instant('settings.templates.delete.confirm'),
      arcCancelText: this.translateService.instant('settings.templates.delete.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => {
        void this.remove(template);
      },
    });
  }

  private async create(name: string, type: string | null): Promise<boolean> {
    try {
      const path = await this.templateService.create({ name, type });
      await this.load();
      await this.select(path);
      return true;
    } catch (error) {
      this.showError('settings.templates.createError', error);
      return false;
    }
  }

  private async remove(template: TemplateDto): Promise<void> {
    try {
      await this.templateService.remove(template.path);
      this.selected.set(null);
      await this.load();
      toast.success(
        this.translateService.instant('settings.templates.delete.done', { name: template.name }),
      );
    } catch (error) {
      this.showError('settings.templates.delete.error', error);
    }
  }

  private async select(key: string): Promise<void> {
    try {
      if (key.startsWith(BUILT_IN_KEY_PREFIX)) {
        const content = await this.templateService.getBuiltIn(
          key.slice(BUILT_IN_KEY_PREFIX.length),
        );
        this.editedContent.set(content);
        this.selected.set({ key, content, contentHash: null });
        return;
      }

      const document = await this.documentService.read(key);
      this.editedContent.set(document.content);
      this.selected.set({ key, content: document.content, contentHash: document.contentHash });
    } catch (error) {
      this.showError('settings.templates.loadError', error);
    }
  }

  private async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const campaign = this.campaignSlug();
      const [library, sections] = await Promise.all([
        this.templateService.list(),
        campaign ? this.sectionService.list(campaign) : Promise.resolve(null),
      ]);
      this.campaignSections.set(sections);
      this.templates.set(library.rows);
      this.types.set(library.types);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private readCampaignSlug(): string | null {
    const [root, slug] = this.appSheetService.underlyingPath().split('/');
    return root === 'campaigns' && slug ? slug : null;
  }

  private showError(key: string, error: unknown): void {
    toast.error(this.translateService.instant(key), {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
