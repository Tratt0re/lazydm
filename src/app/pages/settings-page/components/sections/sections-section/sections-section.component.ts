import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import type { SectionSettingsPayload } from '@/dtos';
import { AppSheetService } from '@/services/app-sheet.service';
import { CampaignService } from '@/services/campaign.service';
import { SectionActionsService } from '@/services/section-actions.service';
import { type AppSection, SectionService } from '@/services/section.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechInputDirective } from '@/shared/components/input';
import { ArcTechSwitchComponent } from '@/shared/components/switch';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/**
 * Settings → Sections: the sections of the campaign under the sheet (saved in `.lazydm/vault.json`) — order
 * (drag or move buttons), name, shown or hidden, and the campaign's own custom sections. Folders on disk are
 * never renamed: renaming changes the name only; deleting a section moves its folder and files to the Trash.
 */
@Component({
  selector: 'app-sections-section',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechInputDirective,
    ArcTechSwitchComponent,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './sections-section.component.html',
})
export class SectionsSectionComponent implements OnInit {
  private readonly sectionService = inject(SectionService);
  private readonly campaignService = inject(CampaignService);
  private readonly appSheetService = inject(AppSheetService);
  private readonly sectionActions = inject(SectionActionsService);
  private readonly translateService = inject(TranslateService);

  protected readonly sections = signal<readonly AppSection[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  /** Campaign of the page under the sheet (`/campaigns/<slug>/…`), or null on the campaign list. */
  protected readonly campaignSlug = signal<string | null>(null);
  protected readonly campaignName = computed(() => {
    const slug = this.campaignSlug();
    const campaign = this.campaignService.activeCampaign();
    return campaign?.slug === slug ? campaign.name : (slug ?? '');
  });

  ngOnInit(): void {
    this.campaignSlug.set(this.readCampaignSlug());
    void this.load();
  }

  protected labelOf(section: AppSection): string {
    return this.sectionService.labelOf(section);
  }

  /** The translated name a default section shows when it is not renamed. */
  protected defaultLabelOf(section: AppSection): string {
    return this.sectionService.labelOf({ key: section.key, customLabel: null });
  }

  protected onDrop(event: CdkDragDrop<readonly AppSection[]>): void {
    this.move(event.previousIndex, event.currentIndex);
  }

  protected move(fromIndex: number, toIndex: number): void {
    const rows = [...this.sections()];
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= rows.length) {
      return;
    }

    moveItemInArray(rows, fromIndex, toIndex);
    void this.save(rows);
  }

  protected setVisible(section: AppSection, isVisible: boolean): void {
    void this.save(
      this.sections().map((row) =>
        row.key === section.key ? { ...row, isHidden: !isVisible } : row,
      ),
    );
  }

  /** A default section goes back to its translated name when emptied; a custom one needs a name. */
  protected rename(section: AppSection, input: HTMLInputElement): void {
    const value = input.value.trim();
    if (section.isCustom && !value) {
      input.value = section.customLabel ?? '';
      return;
    }

    const customLabel =
      section.isCustom || (value && value !== this.defaultLabelOf(section)) ? value : null;
    if (customLabel === section.customLabel) {
      return;
    }

    void this.save(
      this.sections().map((row) => (row.key === section.key ? { ...row, customLabel } : row)),
    );
  }

  protected openCreateSheet(): void {
    this.openSectionSheet(null);
  }

  protected openEditSheet(section: AppSection): void {
    this.openSectionSheet(section);
  }

  protected confirmRemove(section: AppSection): void {
    const campaign = this.campaignSlug();
    if (campaign) {
      this.sectionActions.openDeleteSectionSheet(campaign, section, () => void this.load());
    }
  }

  private openSectionSheet(section: AppSection | null): void {
    const campaign = this.campaignSlug();
    if (campaign) {
      void this.sectionActions.openSectionSheet(campaign, section, (rows) => this.sections.set(rows));
    }
  }

  /** Shows the new order or state right away, then saves; on error the saved state comes back. */
  private async save(rows: readonly AppSection[]): Promise<boolean> {
    this.sections.set(rows);
    return this.saveSettings(this.toSettings(rows));
  }

  private async saveSettings(settings: SectionSettingsPayload): Promise<boolean> {
    const campaign = this.campaignSlug();
    if (!campaign) {
      return false;
    }

    try {
      this.sections.set(await this.sectionService.save(campaign, settings));
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('settings.campaignSections.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      await this.load();
      return false;
    }
  }

  private toSettings(rows: readonly AppSection[]): SectionSettingsPayload {
    return {
      hidden: rows.filter((row) => row.isHidden).map((row) => row.key),
      order: rows.map((row) => row.key),
      labels: Object.fromEntries(
        rows
          .filter((row) => !row.isCustom && row.customLabel)
          .map((row) => [row.key, row.customLabel!]),
      ),
      custom: rows
        .filter((row) => row.isCustom)
        .map((row) => ({
          key: row.key,
          label: row.customLabel ?? row.key,
          type: row.type ?? undefined,
          icon: row.icon,
        })),
    };
  }

  private async load(): Promise<void> {
    const campaign = this.campaignSlug();
    if (!campaign) {
      return;
    }

    this.errorMessage.set(null);
    try {
      this.sections.set(await this.sectionService.list(campaign));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  private readCampaignSlug(): string | null {
    const [root, slug] = this.appSheetService.underlyingPath().split('/');
    return root === 'campaigns' && slug ? slug : null;
  }
}
