import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import type { CompendiumSystemDto } from '@/dtos';
import { CompendiumService } from '@/services/compendium.service';
import { SectionService } from '@/services/section.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const CREATE_SYSTEM_FIELDS: readonly AppSheetField[] = [
  {
    id: 'name',
    type: 'input',
    label: 'compendium.create.nameLabel',
    placeholder: 'compendium.create.namePlaceholder',
    description: 'compendium.create.nameDescription',
    required: true,
    translate: true,
  },
  {
    id: 'description',
    type: 'input',
    label: 'compendium.create.descriptionLabel',
    placeholder: 'compendium.create.descriptionPlaceholder',
    translate: true,
  },
];

/** The vault compendium: systems (cross-campaign folders) to copy notes and files to and from. */
@Component({
  selector: 'app-compendium-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechTooltipImports,
  ],
  templateUrl: './compendium-page.html',
})
export class CompendiumPage implements OnInit {
  private readonly compendiumService = inject(CompendiumService);
  private readonly vaultService = inject(VaultService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly sectionService = inject(SectionService);

  protected readonly systems = this.compendiumService.systems;
  protected readonly vaultName = computed(() => this.vaultService.currentVault()?.name ?? '');
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadSystems();
  }

  /** Folder labels of a system, in campaign section order. */
  protected getFolderLabels(system: CompendiumSystemDto): readonly string[] {
    return system.folders
      .map((folder) => this.sectionService.findSystemSection(folder)?.key)
      .filter((key): key is string => Boolean(key))
      .map((key) => `nav.items.${key}`);
  }

  protected openCreateSheet(): void {
    let isSubmitting = false;

    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('compendium.create.title'),
      arcDescription: this.translateService.instant('compendium.create.description'),
      arcOkText: this.translateService.instant('compendium.create.submit'),
      arcCancelText: this.translateService.instant('compendium.create.cancel'),
      fields: CREATE_SYSTEM_FIELDS,
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.createSystem(
            String(values['name'] ?? ''),
            String(values['description'] ?? ''),
          ).then((created) => {
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

  /** Permanent delete of the folder and everything in it, after a confirmation with the file count. */
  protected async confirmDelete(system: CompendiumSystemDto): Promise<void> {
    let count = 0;
    try {
      count = await this.compendiumService.countFiles(system.slug);
    } catch (error) {
      console.warn('[app] Failed to count compendium files:', system.slug, error);
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('compendium.delete.title', { name: system.name }),
      arcDescription: this.translateService.instant('compendium.delete.description', {
        path: system.path,
        count,
      }),
      arcOkText: this.translateService.instant('compendium.delete.confirm'),
      arcCancelText: this.translateService.instant('compendium.delete.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => {
        void this.deleteSystem(system);
      },
    });
  }

  private async deleteSystem(system: CompendiumSystemDto): Promise<void> {
    try {
      await this.compendiumService.remove(system.slug);
      toast.success(this.translateService.instant('compendium.delete.done', { name: system.name }));
    } catch (error) {
      toast.error(this.translateService.instant('compendium.delete.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async createSystem(name: string, description: string): Promise<boolean> {
    try {
      const system = await this.compendiumService.create({ name, description });
      await this.router.navigate(['/compendium', system.slug]);
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('compendium.create.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async loadSystems(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      await this.compendiumService.loadSystems();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.isLoading.set(false);
    }
  }
}
