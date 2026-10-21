import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { CampaignDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';

/** Editing and deleting a campaign, shared by the campaign list (menu) and the campaign overview (toolbar). */
@Injectable({ providedIn: 'root' })
export class CampaignActionsService {
  private readonly campaignService = inject(CampaignService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);

  /** Name and description of a campaign. The folder keeps its name. */
  openEditSheet(campaign: CampaignDto, onSaved?: (updated: CampaignDto) => void): void {
    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('campaigns.edit.title'),
      arcDescription: this.translateService.instant('campaigns.edit.description'),
      arcOkText: this.translateService.instant('campaigns.edit.submit'),
      arcCancelText: this.translateService.instant('campaigns.create.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'campaigns.create.nameLabel',
          placeholder: 'campaigns.create.namePlaceholder',
          description: 'campaigns.edit.nameDescription',
          value: campaign.name,
          required: true,
          translate: true,
        },
        {
          id: 'description',
          type: 'input',
          label: 'campaigns.create.descriptionLabel',
          placeholder: 'campaigns.create.descriptionPlaceholder',
          value: campaign.description ?? '',
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.save(campaign.slug, String(values['name'] ?? ''), String(values['description'] ?? '')).then(
            (updated) => {
              isSubmitting = false;
              if (updated) {
                dialogRef.close();
                onSaved?.(updated);
              }
            },
          );
        }

        return false;
      },
    });
  }

  /** Confirmation with the file count; the folder goes to the system Trash. Leaves the campaign when it was open. */
  async openDeleteSheet(campaign: CampaignDto, onDeleted?: () => void): Promise<void> {
    let count = 0;
    try {
      count = await this.campaignService.countFiles(campaign.slug);
    } catch (error) {
      console.warn('[app] Failed to count the campaign files:', campaign.slug, error);
    }

    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('campaigns.remove.title', { name: campaign.name }),
      arcDescription: this.translateService.instant('campaigns.remove.description', {
        folder: `${campaign.slug}/`,
        count,
      }),
      arcOkText: this.translateService.instant('campaigns.remove.confirm'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('campaigns.create.cancel'),
      fields: [],
      onSubmit: () => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.remove(campaign).then((isDeleted) => {
            isSubmitting = false;
            if (isDeleted) {
              dialogRef.close();
              onDeleted?.();
            }
          });
        }

        return false;
      },
    });
  }

  private async save(slug: string, name: string, description: string): Promise<CampaignDto | null> {
    try {
      const updated = await this.campaignService.update({
        slug,
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success(this.translateService.instant('campaigns.edit.done', { name: updated.name }));
      return updated;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.edit.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async remove(campaign: CampaignDto): Promise<boolean> {
    try {
      await this.campaignService.remove(campaign.slug);
      toast.success(this.translateService.instant('campaigns.remove.done', { name: campaign.name }));
      if (this.router.url.startsWith(`/campaigns/${campaign.slug}`)) {
        await this.router.navigateByUrl('/campaigns');
      }
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.remove.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
