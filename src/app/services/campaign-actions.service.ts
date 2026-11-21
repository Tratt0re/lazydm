import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  AppCampaignImportSheetComponent,
  type CampaignImportSheetData,
} from '@/components/campaign-import-sheet/campaign-import-sheet.component';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type {
  AppSheetComboboxField,
  AppSheetSelectField,
} from '@/components/sheet-form/sheet-form.types';
import { buildIconPickerField, DEFAULT_CAMPAIGN_ICON } from '@/config/icon-picker.config';
import type { CampaignDto, ImportedCampaignDto } from '@/dtos';
import { BattleRuleService } from '@/services/battle-rule.service';
import { CampaignBundleService } from '@/services/campaign-bundle.service';
import { CampaignService } from '@/services/campaign.service';
import { FileMoveService } from '@/services/file-move.service';
import { CUSTOM_SECTION_ICONS } from '@/services/section.service';
import { ArcTechDialogService } from '@/shared/components/dialog';

/** Icon field of the new / edit campaign forms. */
export function buildCampaignIconField(current: string | null): AppSheetComboboxField {
  return buildIconPickerField({
    id: 'icon',
    label: 'campaigns.create.iconLabel',
    value: current ?? DEFAULT_CAMPAIGN_ICON,
    curated: [DEFAULT_CAMPAIGN_ICON, ...CUSTOM_SECTION_ICONS],
    labelPrefix: 'settings.campaignSections.icons',
  });
}

/** Game systems a campaign can be set to, generic first. */
export const CAMPAIGN_SYSTEMS: readonly string[] = ['generic', 'dnd5e', 'pf2e'];

/** System field of the new / edit campaign forms: it picks the tracker layout and the templates the campaign uses. */
export function buildCampaignSystemField(
  current: string | null,
  description = 'campaigns.create.systemDescription',
): AppSheetSelectField {
  return {
    id: 'system',
    type: 'select',
    label: 'campaigns.create.systemLabel',
    description,
    value: current ?? 'generic',
    translate: true,
    options: CAMPAIGN_SYSTEMS.map((system) => ({
      value: system,
      label: `settings.templates.systems.${system}`,
      translate: true,
    })),
  };
}

/** What goes into `campaign.md`: nothing (generic) unless a system was picked. */
export function toStoredCampaignSystem(value: unknown): string | null {
  return typeof value === 'string' && value !== 'generic' && CAMPAIGN_SYSTEMS.includes(value)
    ? value
    : null;
}

/** What goes into `campaign.md`: nothing for the default icon, so campaigns without a choice stay untouched. */
export function toStoredCampaignIcon(value: unknown): string | null {
  const icon = typeof value === 'string' ? value : '';
  return icon && icon !== DEFAULT_CAMPAIGN_ICON ? icon : null;
}

/** Editing and deleting a campaign, shared by the campaign list (menu) and the campaign overview (toolbar). */
@Injectable({ providedIn: 'root' })
export class CampaignActionsService {
  private readonly campaignService = inject(CampaignService);
  private readonly battleRuleService = inject(BattleRuleService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly dialogService = inject(ArcTechDialogService);
  private readonly bundleService = inject(CampaignBundleService);
  private readonly fileMove = inject(FileMoveService);
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
        buildCampaignIconField(campaign.icon),
        buildCampaignSystemField(campaign.system, 'campaigns.edit.systemDescription'),
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.save(
            campaign.slug,
            String(values['name'] ?? ''),
            String(values['description'] ?? ''),
            toStoredCampaignIcon(values['icon']),
            toStoredCampaignSystem(values['system']),
          ).then((updated) => {
            isSubmitting = false;
            if (updated) {
              dialogRef.close();
              onSaved?.(updated);
            }
          });
        }

        return false;
      },
    });
  }

  /**
   * *Export…*: the system *Save* dialog, then a zip of the campaign. Nothing to decide, so no modal of ours: a toast
   * says where the zip went (with *Show in folder*) and what was left out of it.
   */
  async exportCampaign(campaign: CampaignDto): Promise<void> {
    try {
      const result = await this.bundleService.exportCampaign(campaign.slug);
      if (result.cancelled) {
        return;
      }

      const name = result.path.split(/[\\/]/).pop() ?? result.path;
      const skipped = result.skipped.length;
      const options = {
        description:
          skipped > 0
            ? this.translateService.instant('campaigns.export.skipped', {
                count: skipped,
                files: result.skipped
                  .slice(0, 3)
                  .map((file) => file.path)
                  .join(', '),
              })
            : undefined,
        action: {
          label: this.translateService.instant(this.fileMove.revealLabel),
          onClick: () => void this.bundleService.revealLastExport(),
        },
      };
      if (skipped > 0 || result.droppedTemplates > 0) {
        toast.warning(
          this.translateService.instant('campaigns.export.doneWithSkips', { name }),
          options,
        );
      } else {
        toast.success(this.translateService.instant('campaigns.export.done', { name }), options);
      }
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.export.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * *Import campaign…*: a modal with the drop zone of Assets, then a look at what is in the zip and the name of the
   * new campaign. Opens the new campaign when it is made. `onImported` runs after that.
   */
  openImportSheet(onImported?: (result: ImportedCampaignDto) => void): void {
    const dialogRef = this.dialogService.create<
      AppCampaignImportSheetComponent,
      CampaignImportSheetData
    >({
      arcTitle: this.translateService.instant('campaigns.import.title'),
      arcDescription: this.translateService.instant('campaigns.import.pickDescription'),
      arcContent: AppCampaignImportSheetComponent,
      arcData: {
        onImported: (result) => {
          this.announceImported(result);
          void this.router.navigate(['/campaigns', result.slug]);
          onImported?.(result);
        },
      },
      arcOkText: this.translateService.instant('campaigns.import.submit'),
      arcCancelText: this.translateService.instant('common.cancel'),
      arcCustomClasses: 'sm:max-w-lg',
      arcOnOk: (sheet) => {
        void sheet.confirm();
        return false;
      },
      arcOnBack: () => dialogRef.componentInstance?.back(),
    });
  }

  private announceImported(result: ImportedCampaignDto): void {
    const options = {
      description:
        result.skippedTotal > 0
          ? this.translateService.instant('campaigns.import.doneSkipped', {
              count: result.skippedTotal,
            })
          : undefined,
    };
    const title = this.translateService.instant('campaigns.import.done', { name: result.name });
    if (result.skippedTotal > 0 || result.warnings.length > 0) {
      toast.warning(title, options);
    } else {
      toast.success(title, options);
    }
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

  private async save(
    slug: string,
    name: string,
    description: string,
    icon: string | null,
    system: string | null,
  ): Promise<CampaignDto | null> {
    try {
      const previousSystem =
        this.campaignService.campaigns().find((item) => item.slug === slug)?.system ?? null;
      const updated = await this.campaignService.update({
        slug,
        name: name.trim(),
        description: description.trim() || null,
        icon,
        // Always sent from the edit form: null (generic) clears it.
        system: system ?? 'generic',
      });
      // A new system resets the campaign's layout choice: open encounters must read their layout again.
      if ((updated.system ?? null) !== previousSystem) {
        this.battleRuleService.notifyChanged();
      }
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
      toast.success(
        this.translateService.instant('campaigns.remove.done', { name: campaign.name }),
      );
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
