import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import { CAMPAIGN_SECTIONS } from '@/config/menu.config';
import type { DocumentFileListItemDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import { DocumentService } from '@/services/document.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';

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
  ],
  templateUrl: './campaign-section-page.html',
})
export class CampaignSectionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly campaignService = inject(CampaignService);
  private readonly documentService = inject(DocumentService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);
  private readonly toolbarContext = inject(ToolbarContextService);

  private readonly sectionKey = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(CAMPAIGN_SECTION_PARAM) ?? '')),
    { initialValue: '' },
  );
  private loadToken = 0;

  protected readonly section = computed(
    () => CAMPAIGN_SECTIONS.find((section) => section.key === this.sectionKey()) ?? null,
  );
  protected readonly sectionLabelKey = computed(() => `nav.items.${this.sectionKey()}`);
  protected readonly folderPath = computed(
    () => `${this.campaignService.activeCampaign()?.slug ?? ''}/${this.sectionKey()}`,
  );
  protected readonly campaignSlug = computed(() => this.campaignService.activeCampaign()?.slug ?? '');

  protected readonly files = signal<readonly DocumentFileListItemDto[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly formatFileSize = formatFileSize;

  constructor() {
    effect((onCleanup) => {
      const campaign = this.campaignService.activeCampaign();
      const section = this.section();
      if (!campaign) {
        return;
      }

      if (!section) {
        void this.router.navigate(['/campaigns', campaign.slug]);
        return;
      }

      onCleanup(
        this.toolbarContext.activate({
          title: this.sectionLabelKey(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: campaign.name, path: `/campaigns/${campaign.slug}`, translate: false },
          ],
        }),
      );
      void this.loadFiles(`${campaign.slug}/${section.key}`);
    });
  }

  protected toNoteSlug(file: DocumentFileListItemDto): string {
    return file.name;
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
      const note = await this.documentService.create({ folder: this.folderPath(), title, type });
      const noteSlug = note.path.split('/').pop()!.replace(/\.md$/i, '');
      await this.router.navigate(['/campaigns', this.campaignSlug(), this.sectionKey(), noteSlug]);
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
