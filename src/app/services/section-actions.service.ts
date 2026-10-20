import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { DocumentService } from '@/services/document.service';
import { FileActionsService } from '@/services/file-actions.service';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { CustomSectionPayload, SectionSettingsPayload } from '@/dtos';
import {
  type AppSection,
  CUSTOM_SECTION_ICONS,
  SectionService,
  toSectionSettings,
} from '@/services/section.service';
import { AUTOMATIC_TEMPLATE_RULE, TemplateService } from '@/services/template.service';

/**
 * Creating and editing the sections of a campaign (name, description, icon, template), shared by the campaign
 * overview and Settings → Sections. A template is linked through the same per-type choice as the select of the
 * section page.
 */
@Injectable({ providedIn: 'root' })
export class SectionActionsService {
  private readonly sectionService = inject(SectionService);
  private readonly templateService = inject(TemplateService);
  private readonly documentService = inject(DocumentService);
  private readonly fileActions = inject(FileActionsService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly translateService = inject(TranslateService);

  /**
   * New section (name, description, icon, template, note type) or an existing custom one (the folder and the
   * note type stay). `onSaved` gets the campaign's sections once saved.
   */
  async openSectionSheet(
    campaign: string,
    section: AppSection | null,
    onSaved?: (rows: readonly AppSection[]) => void,
  ): Promise<void> {
    const [library, rules] = await Promise.all([
      this.templateService.list(),
      this.templateService.getRules(campaign),
    ]);
    const currentRule =
      (section?.type ? rules[section.type] : undefined) ?? AUTOMATIC_TEMPLATE_RULE;
    const prefix = section ? 'settings.campaignSections.edit' : 'settings.campaignSections.create';
    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant(`${prefix}.title`),
      arcDescription: this.translateService.instant(`${prefix}.description`),
      arcOkText: this.translateService.instant(`${prefix}.submit`),
      arcCancelText: this.translateService.instant('settings.campaignSections.cancel'),
      fields: [
        {
          id: 'label',
          type: 'input',
          label: 'settings.campaignSections.create.nameLabel',
          placeholder: 'settings.campaignSections.create.namePlaceholder',
          value: section?.customLabel ?? '',
          required: true,
          translate: true,
        },
        {
          id: 'description',
          type: 'input',
          label: 'settings.campaignSections.create.descriptionLabel',
          placeholder: 'settings.campaignSections.create.descriptionPlaceholder',
          value: section?.description ?? '',
          translate: true,
        },
        {
          id: 'icon',
          type: 'select',
          label: 'settings.campaignSections.create.iconLabel',
          value: section?.icon ?? CUSTOM_SECTION_ICONS[0],
          required: true,
          translate: true,
          options: CUSTOM_SECTION_ICONS.map((icon) => ({
            value: icon,
            label: `settings.campaignSections.icons.${icon}`,
            icon,
            translate: true,
          })),
        },
        {
          id: 'template',
          type: 'select',
          label: 'settings.campaignSections.create.templateLabel',
          description: 'settings.campaignSections.create.templateDescription',
          value: currentRule,
          translate: true,
          options: this.templateService
            .getRuleOptions(
              library.rows,
              campaign,
              currentRule,
              section?.type ? library.types.includes(section.type) : false,
            )
            .map((option) => ({ ...option, translate: false })),
        },
        {
          id: 'type',
          type: 'input',
          label: 'settings.campaignSections.create.typeLabel',
          placeholder: 'settings.campaignSections.create.typePlaceholder',
          description: section
            ? 'settings.campaignSections.edit.typeDescription'
            : 'settings.campaignSections.create.typeDescription',
          value: section?.type ?? '',
          disabled: section !== null,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          const custom: CustomSectionPayload = {
            key: section?.key,
            label: String(values['label'] ?? '').trim(),
            description: String(values['description'] ?? '').trim() || undefined,
            type: section ? undefined : String(values['type'] ?? '').trim() || undefined,
            icon: String(values['icon'] ?? CUSTOM_SECTION_ICONS[0]),
          };
          const rule = String(values['template'] ?? AUTOMATIC_TEMPLATE_RULE);
          void this.saveSection(campaign, section, custom, rule, currentRule).then((rows) => {
            isSubmitting = false;
            if (rows) {
              dialogRef.close();
              onSaved?.(rows);
            }
          });
        }

        return false;
      },
    });
  }

  /**
   * *Delete…* a section with all its content, after a confirmation with its file count: the folder goes to the
   * system Trash; links to its files become plain text / embeds are removed unless unticked.
   */
  openDeleteSectionSheet(campaign: string, section: AppSection, onDeleted?: () => void): void {
    let isSubmitting = false;
    const name = this.sectionService.labelOf(section);
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('settings.campaignSections.remove.title', { name }),
      arcDescription: this.translateService.instant(
        'settings.campaignSections.remove.description',
        { folder: `${section.key}/`, count: section.fileCount },
      ),
      arcOkText: this.translateService.instant('settings.campaignSections.remove.confirm'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('settings.campaignSections.cancel'),
      fields: [
        {
          id: 'rewriteLinks',
          type: 'checkbox',
          value: true,
          checkboxLabel: this.translateService.instant(
            'settings.campaignSections.remove.rewriteLinks',
          ),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const rewriteLinks = form.getValues()['rewriteLinks'] !== false;
          void this.deleteSection(campaign, section, name, rewriteLinks).then((isDeleted) => {
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

  private async deleteSection(
    campaign: string,
    section: AppSection,
    name: string,
    rewriteLinks: boolean,
  ): Promise<boolean> {
    try {
      const result = await this.documentService.deleteSection(campaign, section.key, rewriteLinks);
      await this.sectionService.list(campaign);
      await this.fileActions.followDeletedSection(campaign, section.key, result.deleted);
      toast.success(
        this.translateService.instant('settings.campaignSections.remove.done', { name }),
        result.linkCount > 0
          ? {
              description: this.translateService.instant('files.delete.linksUpdated', {
                links: result.linkCount,
                notes: result.updatedPaths.length,
              }),
            }
          : undefined,
      );
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      return true;
    } catch (error) {
      toast.error(this.translateService.instant('settings.campaignSections.remove.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Saves the section, then its template choice; null when it failed (shown). */
  private async saveSection(
    campaign: string,
    section: AppSection | null,
    custom: CustomSectionPayload,
    rule: string,
    currentRule: string,
  ): Promise<readonly AppSection[] | null> {
    try {
      const previous = await this.sectionService.list(campaign);
      const settings = toSectionSettings(previous);
      const next: SectionSettingsPayload = section
        ? {
            ...settings,
            custom: settings.custom.map((item) => (item.key === section.key ? custom : item)),
          }
        : { ...settings, custom: [...settings.custom, custom] };
      const rows = await this.sectionService.save(campaign, next);

      const type =
        section?.type ??
        rows.find((row) => !previous.some((item) => item.key === row.key))?.type ??
        null;
      if (type && rule !== currentRule) {
        await this.templateService.setRule(
          campaign,
          type,
          rule === AUTOMATIC_TEMPLATE_RULE ? null : rule,
        );
      }

      return rows;
    } catch (error) {
      toast.error(this.translateService.instant('settings.campaignSections.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
