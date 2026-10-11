import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { toast } from 'ngx-sonner';

import { AppCodeEditorComponent } from '@/components/code-editor/code-editor.component';
import { AppDocumentPreviewComponent } from '@/components/document-preview/document-preview.component';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import type { DocumentDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import { DocumentService } from '@/services/document.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import type { ArcTechSheetRef } from '@/shared/components/sheet';
import { ArcTechSheetService } from '@/shared/components/sheet';

export const DOCUMENT_NOTE_PARAM = 'note';

type DocumentViewMode = 'write' | 'preview';

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

  protected readonly isDirty = computed(
    () => this.document() !== null && this.editedContent() !== this.document()!.content,
  );
  protected readonly previewBody = computed(() => stripFrontmatterFence(this.editedContent()));

  constructor() {
    effect((onCleanup) => {
      if (!this.campaignService.activeCampaign()) {
        return;
      }

      onCleanup(
        this.toolbarContext.activate({
          title: this.document()?.title ?? this.noteSlug(),
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
