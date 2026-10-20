import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import { Toolbar } from '@/layout/toolbar/toolbar';
import { CampaignService } from '@/services/campaign.service';
import { SectionService } from '@/services/section.service';
import type { ToolbarItemAction, ToolbarTitleBreadcrumbItem } from '@/services/toolbar-context.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';

const CREATE_CAMPAIGN_FIELDS: readonly AppSheetField[] = [
  {
    id: 'name',
    type: 'input',
    label: 'campaigns.create.nameLabel',
    placeholder: 'campaigns.create.namePlaceholder',
    description: 'campaigns.create.nameDescription',
    required: true,
    translate: true,
  },
  {
    id: 'description',
    type: 'input',
    label: 'campaigns.create.descriptionLabel',
    placeholder: 'campaigns.create.descriptionPlaceholder',
    translate: true,
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-campaign-list-page',
  imports: [
    RouterLink,
    Toolbar,
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
  ],
  templateUrl: './campaign-list-page.html',
})
export class CampaignListPage implements OnInit {
  private readonly campaignService = inject(CampaignService);
  private readonly vaultService = inject(VaultService);
  private readonly sectionService = inject(SectionService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);

  protected readonly campaigns = this.campaignService.campaigns;
  protected readonly vaultName = computed(() => this.vaultService.currentVault()?.name ?? '');
  protected readonly isLoading = signal(true);
  /** Same toolbar as the other pages: vault name as the path, "New campaign" as its action. */
  protected readonly titleBreadcrumbs = computed<readonly ToolbarTitleBreadcrumbItem[]>(() =>
    this.vaultName() ? [{ label: this.vaultName(), translate: false }] : [],
  );
  protected readonly toolbarActions = computed<readonly ToolbarItemAction[]>(() =>
    this.campaigns().length > 0
      ? [
          {
            id: 'create-campaign',
            label: 'campaigns.list.create',
            icon: 'plus',
            action: () => this.openCreateSheet(),
          },
        ]
      : [],
  );
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadCampaigns();
  }

  protected openCreateSheet(): void {
    let isSubmitting = false;
    const presets = this.sectionService.presetSections();

    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('campaigns.create.title'),
      arcDescription: this.translateService.instant('campaigns.create.description'),
      arcOkText: this.translateService.instant('campaigns.create.submit'),
      arcCancelText: this.translateService.instant('campaigns.create.cancel'),
      fields: [
        ...CREATE_CAMPAIGN_FIELDS,
        {
          id: 'presets',
          type: 'select',
          multiple: true,
          label: 'campaigns.create.presetsLabel',
          description: 'campaigns.create.presetsDescription',
          value: presets.map((section) => section.key),
          translate: true,
          options: presets.map((section) => ({
            value: section.key,
            label: this.sectionService.labelOf(section),
            icon: section.icon,
            translate: false,
          })),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          const chosen = values['presets'];
          void this.createCampaign(
            String(values['name'] ?? ''),
            String(values['description'] ?? ''),
            Array.isArray(chosen) ? chosen.map(String) : [],
          ).then(
            (created) => {
              isSubmitting = false;
              if (created) {
                dialogRef.close();
              }
            },
          );
        }

        // The sheet is closed once the campaign folder exists (creation goes through IPC).
        return false;
      },
    });
  }

  private async createCampaign(
    name: string,
    description: string,
    presets: readonly string[],
  ): Promise<boolean> {
    try {
      const campaign = await this.campaignService.create({ name, description, presets });
      await this.router.navigate(['/campaigns', campaign.slug]);
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.create.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async loadCampaigns(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.campaignService.loadCampaigns();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.isLoading.set(false);
    }
  }
}
