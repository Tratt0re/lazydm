import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  parseVaultFilePath,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import { CampaignService } from '@/services/campaign.service';
import { CompendiumService } from '@/services/compendium.service';
import { DocumentService } from '@/services/document.service';

interface CopyTarget {
  /** `lost-mine` or `compendium/my-system`. */
  readonly value: string;
  readonly label: string;
}

/**
 * Copies a note, asset or template between campaigns and the compendium (the original stays): from a
 * campaign to a compendium system, from a system to a campaign. A taken name asks for another one.
 */
@Injectable({
  providedIn: 'root',
})
export class CopyToService {
  private readonly documentService = inject(DocumentService);
  private readonly campaignService = inject(CampaignService);
  private readonly compendiumService = inject(CompendiumService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);

  isInCompendium(path: string): boolean {
    return parseVaultFilePath(path)?.scopePath.startsWith('compendium/') ?? false;
  }

  async openCopySheet(path: string): Promise<void> {
    const toCompendium = !this.isInCompendium(path);
    let targets: readonly CopyTarget[];
    try {
      targets = toCompendium
        ? (await this.compendiumService.loadSystems()).map((system) => ({
            value: system.path,
            label: system.name,
          }))
        : (await this.campaignService.loadCampaigns()).map((campaign) => ({
            value: campaign.slug,
            label: campaign.name,
          }));
    } catch (error) {
      toast.error(this.translateService.instant('compendium.copy.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (targets.length === 0) {
      toast.info(
        this.translateService.instant(
          toCompendium ? 'compendium.copy.noSystems' : 'compendium.copy.noCampaigns',
        ),
      );
      return;
    }

    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant(
        toCompendium ? 'compendium.copy.toCompendium' : 'compendium.copy.toCampaign',
      ),
      arcDescription: this.translateService.instant('compendium.copy.description', {
        name: path.split('/').pop() ?? path,
      }),
      arcOkText: this.translateService.instant('compendium.copy.submit'),
      arcCancelText: this.translateService.instant('compendium.copy.cancel'),
      fields: [
        {
          id: 'target',
          type: 'select',
          label: toCompendium ? 'compendium.copy.systemLabel' : 'compendium.copy.campaignLabel',
          value: targets[0].value,
          required: true,
          translate: true,
          options: targets.map((target) => ({ value: target.value, label: target.label })),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const target =
            targets.find((item) => item.value === form.getValues()['target']) ?? targets[0];
          void this.copy(path, target, null).then((isDone) => {
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

  /** Resolves when the copy flow is over for this sheet (copied, or handed over to the rename sheet). */
  private async copy(path: string, target: CopyTarget, fileName: string | null): Promise<boolean> {
    try {
      const result = await this.documentService.copy({ path, target: target.value, fileName });
      if (result.status === 'exists') {
        this.openRenameSheet(path, target, result.path);
        return true;
      }

      if (target.value === this.compendiumService.activeSystem()?.path) {
        await this.compendiumService.refreshActive();
      }

      const route = toInAppNoteRoute(result.path) ?? this.getFolderRoute(result.path);
      toast.success(
        this.translateService.instant('compendium.copy.done', { target: target.label }),
        {
          description: result.path,
          action: route
            ? {
                label: this.translateService.instant('compendium.copy.open'),
                onClick: () => void this.router.navigateByUrl(route),
              }
            : undefined,
        },
      );
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('compendium.copy.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private openRenameSheet(path: string, target: CopyTarget, takenPath: string): void {
    const location = parseVaultFilePath(path);
    const baseName = (location?.name ?? path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('compendium.copy.existsTitle'),
      arcDescription: this.translateService.instant('compendium.copy.existsDescription', {
        path: takenPath,
      }),
      arcOkText: this.translateService.instant('compendium.copy.submit'),
      arcCancelText: this.translateService.instant('compendium.copy.cancel'),
      fields: [
        {
          id: 'fileName',
          type: 'input',
          label: 'compendium.copy.fileNameLabel',
          value: `${baseName}-copy`,
          required: true,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.copy(path, target, String(form.getValues()['fileName'] ?? '')).then(
            (isDone) => {
              isSubmitting = false;
              if (isDone) {
                sheetRef.close();
              }
            },
          );
        }

        return false;
      },
    });
  }

  private getFolderRoute(path: string): string | null {
    const location = parseVaultFilePath(path);
    return location ? `${location.scopeRoute}/${location.section}` : null;
  }
}
