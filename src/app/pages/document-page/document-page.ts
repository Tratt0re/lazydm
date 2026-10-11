import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { toast } from 'ngx-sonner';

import { AppCodeEditorComponent } from '@/components/code-editor/code-editor.component';
import { AppDocumentLinksPanelComponent } from '@/components/document-links-panel/document-links-panel.component';
import { AppDocumentPreviewComponent } from '@/components/document-preview/document-preview.component';
import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import type { BacklinkDto, DocumentDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import { DocumentService } from '@/services/document.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import type { ArcTechSheetRef } from '@/shared/components/sheet';
import { ArcTechSheetService } from '@/shared/components/sheet';

export const DOCUMENT_NOTE_PARAM = 'note';

type DocumentViewMode = 'write' | 'preview';

const RENAME_PREVIEW_MAX_TITLES = 5;

const FRONTMATTER_FENCE_PATTERN = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n?/;

/** Strips the YAML header for display only; no field parsing happens on the frontend. */
function stripFrontmatterFence(content: string): string {
  return content.replace(FRONTMATTER_FENCE_PATTERN, '');
}

@Component({
  selector: 'app-document-page',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    AppCodeEditorComponent,
    AppDocumentLinksPanelComponent,
    AppDocumentPreviewComponent,
  ],
  templateUrl: './document-page.html',
})
export class DocumentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly campaignService = inject(CampaignService);
  private readonly documentService = inject(DocumentService);
  private readonly sheetService = inject(ArcTechSheetService);
  private readonly translateService = inject(TranslateService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly localPreferences = inject(LocalPreferencesService);
  private readonly workspace = inject(WorkspaceService);
  private readonly editor = viewChild(AppCodeEditorComponent);
  private loadToken = 0;

  private readonly sectionKey = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(CAMPAIGN_SECTION_PARAM) ?? '')),
    { initialValue: '' },
  );
  private readonly noteSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(DOCUMENT_NOTE_PARAM) ?? '')),
    { initialValue: '' },
  );

  protected readonly notePath = computed(
    () =>
      `${this.campaignService.activeCampaign()?.slug ?? ''}/${this.sectionKey()}/${this.noteSlug()}.md`,
  );

  protected readonly document = signal<DocumentDto | null>(null);
  protected readonly editedContent = signal('');
  protected readonly mode = signal<DocumentViewMode>('write');
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isLinksPanelOpen = signal(this.localPreferences.getDocumentLinksPanelOpen());

  protected readonly isDirty = computed(
    () => this.document() !== null && this.editedContent() !== this.document()!.content,
  );
  protected readonly previewBody = computed(() => stripFrontmatterFence(this.editedContent()));

  constructor() {
    effect((onCleanup) => {
      const campaign = this.campaignService.activeCampaign();
      if (!campaign) {
        return;
      }

      const campaignPath = `/campaigns/${campaign.slug}`;
      onCleanup(
        this.toolbarContext.activate({
          title: this.document()?.title ?? this.noteSlug(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: campaign.name, path: campaignPath, translate: false },
            { label: `nav.items.${this.sectionKey()}`, path: `${campaignPath}/${this.sectionKey()}` },
          ],
          itemNavigation: {
            id: 'document-mode',
            type: 'segmented',
            defaultValue: 'write',
            ariaLabel: this.translateService.instant('document.toolbar.modeAriaLabel'),
            options: [
              { value: 'write', label: this.translateService.instant('document.toolbar.write') },
              {
                value: 'preview',
                label: this.translateService.instant('document.toolbar.preview'),
              },
            ],
            change: (value) => this.mode.set(value as DocumentViewMode),
          },
          itemActions: [
            {
              id: 'links',
              label: this.translateService.instant('document.toolbar.links'),
              icon: 'panel-right',
              buttonType: 'outline',
              action: () => this.toggleLinksPanel(),
            },
            {
              id: 'rename',
              label: this.translateService.instant('document.toolbar.rename'),
              icon: 'pencil-line',
              buttonType: 'outline',
              disabled: () => !this.document() || this.isSaving(),
              action: () => this.openRenameSheet(),
            },
            {
              id: 'save',
              label: this.translateService.instant('document.toolbar.save'),
              icon: 'save',
              disabled: () => !this.isDirty() || this.isSaving(),
              action: async () => {
                await this.save();
              },
            },
          ],
        }),
      );
    });

    effect(() => {
      void this.loadDocument(this.notePath());
    });
  }

  /** Autosave when leaving the note (tab switch, link, sidebar); a conflict or error keeps the user here. */
  async saveBeforeLeave(): Promise<boolean> {
    return !this.isDirty() || (await this.save());
  }

  protected async save(): Promise<boolean> {
    const document = this.document();
    if (!document || this.isSaving()) {
      return false;
    }

    this.isSaving.set(true);
    try {
      const result = await this.documentService.write({
        path: document.path,
        content: this.editedContent(),
        expectedHash: document.contentHash,
      });

      if (result.status === 'saved') {
        this.document.set(await this.documentService.read(document.path));
        toast.success(this.translateService.instant('document.toast.saved'));
        return true;
      }

      this.openConflictSheet(result.current);
      return false;
    } catch (error) {
      toast.error(this.translateService.instant('document.toast.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  protected toggleLinksPanel(): void {
    const isOpen = !this.isLinksPanelOpen();
    this.isLinksPanelOpen.set(isOpen);
    this.localPreferences.setDocumentLinksPanelOpen(isOpen);
  }

  /** Rename with a preview of the notes linking here; unsaved edits are saved first (as when leaving). */
  protected async openRenameSheet(): Promise<void> {
    const document = this.document();
    if (!document || (this.isDirty() && !(await this.save()))) {
      return;
    }

    let backlinks: readonly BacklinkDto[] = [];
    try {
      backlinks = (await this.documentService.links(document.path)).backlinks;
    } catch (error) {
      console.warn('[app] Failed to load backlinks for rename:', document.path, error);
    }

    const sourceTitles = [
      ...new Map(backlinks.map((link) => [link.sourcePath, link.sourceTitle ?? link.sourcePath])).values(),
    ];
    const listedTitles = sourceTitles.slice(0, RENAME_PREVIEW_MAX_TITLES).join(', ');
    const hiddenCount = sourceTitles.length - RENAME_PREVIEW_MAX_TITLES;
    const fields: AppSheetField[] = [
      {
        id: 'title',
        type: 'input',
        label: 'document.rename.titleLabel',
        value: document.title,
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
          ? this.translateService.instant('document.rename.linkedFrom', {
              notes: hiddenCount > 0 ? `${listedTitles} +${hiddenCount}` : listedTitles,
            })
          : this.translateService.instant('document.rename.noBacklinks'),
      arcOkText: this.translateService.instant('document.rename.submit'),
      arcCancelText: this.translateService.instant('document.rename.cancel'),
      fields,
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.renameNote(document, String(values['title'] ?? ''), values['updateLinks'] !== false).then(
            (isRenamed) => {
              isSubmitting = false;
              if (isRenamed) {
                sheetRef.close();
              }
            },
          );
        }

        return false;
      },
    });
  }

  private async renameNote(document: DocumentDto, title: string, updateLinks: boolean): Promise<boolean> {
    try {
      const result = await this.documentService.rename({ path: document.path, title, updateLinks });
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

      const oldRoute = toInAppNoteRoute(document.path);
      const newRoute = toInAppNoteRoute(result.path);
      if (oldRoute && newRoute && oldRoute !== newRoute) {
        await this.workspace.replaceUrl(oldRoute, newRoute);
      } else {
        const renamed = await this.documentService.read(result.path);
        this.document.set(renamed);
        this.editedContent.set(renamed.content);
        this.editor()?.replaceContent(renamed.content);
      }

      return true;
    } catch (error) {
      toast.error(this.translateService.instant('document.rename.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private openConflictSheet(current: DocumentDto): void {
    let isBusy = false;

    const sheetRef: ArcTechSheetRef = this.sheetService.create({
      arcTitle: this.translateService.instant('document.conflict.title'),
      arcContent: this.translateService.instant('document.conflict.description'),
      arcOkText: this.translateService.instant('document.conflict.keepMine'),
      arcOkDestructive: true,
      arcMiddleText: this.translateService.instant('document.conflict.saveCopy'),
      arcCancelText: this.translateService.instant('document.conflict.reload'),
      arcOnOk: () => {
        if (!isBusy) {
          isBusy = true;
          void this.forceOverwrite(current).finally(() => {
            isBusy = false;
            sheetRef.close();
          });
        }
        return false;
      },
      arcOnMiddle: () => {
        if (!isBusy) {
          isBusy = true;
          void this.saveAsCopy().finally(() => {
            isBusy = false;
            sheetRef.close();
          });
        }
        return false;
      },
      arcOnCancel: () => {
        this.document.set(current);
        this.editedContent.set(current.content);
        this.editor()?.replaceContent(current.content);
      },
    });
  }

  private async forceOverwrite(current: DocumentDto): Promise<void> {
    try {
      const result = await this.documentService.write({
        path: current.path,
        content: this.editedContent(),
        expectedHash: current.contentHash,
      });

      if (result.status === 'saved') {
        this.document.set(await this.documentService.read(current.path));
        toast.success(this.translateService.instant('document.toast.saved'));
      } else {
        toast.error(this.translateService.instant('document.toast.saveError'));
      }
    } catch (error) {
      toast.error(this.translateService.instant('document.toast.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async saveAsCopy(): Promise<void> {
    const document = this.document();
    if (!document) {
      return;
    }

    try {
      const copy = await this.documentService.saveCopy({
        path: document.path,
        content: this.editedContent(),
      });
      toast.success(this.translateService.instant('document.toast.savedCopy', { path: copy.path }));
      this.editedContent.set(document.content);

      const copySlug = copy.path.split('/').pop()!.replace(/\.md$/i, '');
      await this.router.navigate([
        '/campaigns',
        this.campaignService.activeCampaign()?.slug,
        this.sectionKey(),
        copySlug,
      ]);
    } catch (error) {
      toast.error(this.translateService.instant('document.toast.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadDocument(notePath: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const document = await this.documentService.read(notePath);
      if (token === this.loadToken) {
        this.document.set(document);
        this.editedContent.set(document.content);
        this.mode.set('write');
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
