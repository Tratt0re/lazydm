import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  parseVaultFilePath,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { AppSheetComboboxGroup } from '@/components/sheet-form/sheet-form.types';
import type { CopyPlanDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import { CompendiumService } from '@/services/compendium.service';
import { DocumentService } from '@/services/document.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { toastOpenActionClass } from '@/shared/components/toast';
import type { NoteScope } from '@/services/note-scope.service';

interface CopyTarget {
  /** `lost-mine` or `compendium/my-system`. */
  readonly value: string;
  readonly label: string;
}

const LINKED_PREVIEW_MAX_TITLES = 6;

/**
 * Copies notes, assets and templates between campaigns and the compendium (the original stays): from a
 * campaign to a compendium system, from a system to a campaign. Linked files the target is missing can
 * come along; a taken name asks for another one.
 */
@Injectable({
  providedIn: 'root',
})
export class CopyToService {
  private readonly documentService = inject(DocumentService);
  private readonly sectionService = inject(SectionService);
  private readonly campaignService = inject(CampaignService);
  private readonly compendiumService = inject(CompendiumService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);

  isInCompendium(path: string): boolean {
    return parseVaultFilePath(path)?.scopePath.startsWith('compendium/') ?? false;
  }

  /** "Copy to…" on a note or file: pick the target (a system from a campaign, a campaign from a system). */
  async openCopySheet(path: string): Promise<void> {
    const toCompendium = !this.isInCompendium(path);
    const targets = await this.loadTargets(toCompendium);
    if (!targets) {
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

    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant(
        toCompendium ? 'compendium.copy.toCompendium' : 'compendium.copy.toCampaign',
      ),
      arcDescription: this.translateService.instant('compendium.copy.description', {
        name: path.split('/').pop() ?? path,
      }),
      arcOkText: this.translateService.instant('compendium.copy.next'),
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
        const target =
          targets.find((item) => item.value === form.getValues()['target']) ?? targets[0];
        dialogRef.close();
        void this.copyWithLinkedChoice(path, target);
        return false;
      },
    });
  }

  /**
   * "Import from compendium" in a campaign folder (or "Import from campaign" in a system folder): pick a
   * file of the same folder from the other side and copy it here. `onImported` runs after the copy.
   */
  async openImportSheet(
    scope: NoteScope,
    sectionKey: string,
    onImported: () => void,
  ): Promise<void> {
    const fromCompendium = scope.kind === 'campaign';
    const sources = await this.loadTargets(fromCompendium);
    if (!sources) {
      return;
    }

    let groups: AppSheetComboboxGroup[];
    try {
      groups = (
        await Promise.all(
          sources.map(async (source) => ({
            label: source.label,
            options: (await this.documentService.listFolder(`${source.value}/${sectionKey}`)).map(
              (file) => ({ value: file.path, label: file.kind === 'md' ? file.title : file.name }),
            ),
          })),
        )
      ).filter((group) => group.options.length > 0);
    } catch (error) {
      toast.error(this.translateService.instant('compendium.copy.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (groups.length === 0) {
      toast.info(
        this.translateService.instant(
          fromCompendium ? 'compendium.import.emptyCompendium' : 'compendium.import.emptyCampaigns',
          { section: this.sectionService.labelOfKey(sectionKey, scope.kind) },
        ),
      );
      return;
    }

    const target: CopyTarget = { value: scope.rootPath, label: scope.name };
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant(
        fromCompendium ? 'compendium.import.fromCompendium' : 'compendium.import.fromCampaign',
      ),
      arcDescription: this.translateService.instant('compendium.import.description', {
        section: this.sectionService.labelOfKey(sectionKey, scope.kind),
        target: scope.name,
      }),
      arcOkText: this.translateService.instant('compendium.copy.next'),
      arcCancelText: this.translateService.instant('compendium.copy.cancel'),
      fields: [
        {
          id: 'source',
          type: 'combobox',
          label: 'compendium.import.fileLabel',
          required: true,
          translate: true,
          searchable: true,
          groups,
        },
      ],
      onSubmit: (form) => {
        const sourcePath = String(form.getValues()['source'] ?? '');
        if (!sourcePath) {
          return false;
        }

        dialogRef.close();
        void this.copyWithLinkedChoice(sourcePath, target, onImported);
        return false;
      },
    });
  }

  /**
   * Asks how to place a file that sits in a sub-folder (only then), then whether to bring the linked files
   * the target is missing (only when there are some), then copies.
   */
  private async copyWithLinkedChoice(
    path: string,
    target: CopyTarget,
    onCopied?: () => void,
  ): Promise<void> {
    let plan: CopyPlanDto = { linked: [], subfolder: null };
    try {
      plan = await this.documentService.copyPlan(path, target.value);
    } catch (error) {
      console.warn('[app] Failed to plan the copy:', path, error);
    }

    const placed = plan.subfolder;
    if (!placed) {
      await this.copyWithLinkedFiles(path, target, plan, null, onCopied);
      return;
    }

    this.openPlacementSheet(
      path,
      target,
      placed,
      (subfolder) => void this.copyWithLinkedFiles(path, target, plan, subfolder, onCopied),
    );
  }

  /**
   * The file is in a sub-folder: bring the sub-folder too (merging into the target's one when it has it),
   * copy only the file into the section, or use another sub-folder name. `onChosen` gets the sub-folder
   * to put the file in (null: the section itself).
   */
  private openPlacementSheet(
    path: string,
    target: CopyTarget,
    placed: NonNullable<CopyPlanDto['subfolder']>,
    onChosen: (subfolder: string | null) => void,
  ): void {
    const section = this.sectionService.labelOfKey(
      placed.section,
      target.value.startsWith('compendium/') ? 'system' : 'campaign',
    );
    const subfolderLabel = toSubfolderLabel(placed.name);
    const notes = [
      placed.exists
        ? this.translateService.instant('compendium.subfolder.exists', { target: target.label })
        : null,
      placed.fileExists ? this.translateService.instant('compendium.subfolder.fileExists') : null,
    ].filter((note): note is string => note !== null);

    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('compendium.subfolder.title'),
      arcDescription: [
        this.translateService.instant('compendium.subfolder.description', {
          name: path.split('/').pop() ?? path,
          subfolder: subfolderLabel,
          section,
        }),
        ...notes,
      ].join(' '),
      arcOkText: this.translateService.instant('compendium.copy.next'),
      arcCancelText: this.translateService.instant('compendium.copy.cancel'),
      fields: [
        {
          id: 'placement',
          type: 'select',
          label: 'compendium.subfolder.placementLabel',
          value: 'keep',
          required: true,
          translate: true,
          options: [
            {
              value: 'keep',
              label: this.translateService.instant(
                placed.exists ? 'compendium.subfolder.merge' : 'compendium.subfolder.keep',
                { subfolder: subfolderLabel },
              ),
              icon: 'folder',
              translate: false,
            },
            {
              value: 'root',
              label: this.translateService.instant('compendium.subfolder.root', { section }),
              icon: 'file',
              translate: false,
            },
            {
              value: 'rename',
              label: this.translateService.instant('compendium.subfolder.rename'),
              icon: 'text-cursor-input',
              translate: false,
            },
          ],
        },
      ],
      onSubmit: (form) => {
        const placement = String(form.getValues()['placement'] ?? 'keep');
        dialogRef.close();
        if (placement === 'rename') {
          this.openSubfolderNameSheet(placed.name, onChosen);
        } else {
          onChosen(placement === 'root' ? null : placed.name);
        }

        return false;
      },
    });
  }

  /** Another name for the sub-folder the file comes with (created in the target when it has none of that name). */
  private openSubfolderNameSheet(name: string, onChosen: (subfolder: string | null) => void): void {
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('compendium.subfolder.nameTitle'),
      arcDescription: this.translateService.instant('compendium.subfolder.nameDescription'),
      arcOkText: this.translateService.instant('compendium.copy.next'),
      arcCancelText: this.translateService.instant('compendium.copy.cancel'),
      fields: [
        {
          id: 'subfolder',
          type: 'input',
          label: 'compendium.subfolder.nameLabel',
          value: name,
          required: true,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        const subfolder = String(form.getValues()['subfolder'] ?? '').trim();
        if (!subfolder) {
          return false;
        }

        dialogRef.close();
        onChosen(subfolder);
        return false;
      },
    });
  }

  /** Asks whether to bring the linked files the target is missing (only when there are some), then copies. */
  private async copyWithLinkedFiles(
    path: string,
    target: CopyTarget,
    plan: CopyPlanDto,
    subfolder: string | null,
    onCopied?: () => void,
  ): Promise<void> {
    if (plan.linked.length === 0) {
      await this.copy(path, target, null, false, subfolder, onCopied);
      return;
    }

    const titles = plan.linked.map((file) => file.title);
    const hiddenCount = titles.length - LINKED_PREVIEW_MAX_TITLES;
    const listedTitles = titles.slice(0, LINKED_PREVIEW_MAX_TITLES).join(', ');

    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('compendium.linked.title'),
      arcDescription: this.translateService.instant('compendium.linked.description', {
        target: target.label,
        files: hiddenCount > 0 ? `${listedTitles} +${hiddenCount}` : listedTitles,
      }),
      arcOkText: this.translateService.instant('compendium.copy.submit'),
      arcCancelText: this.translateService.instant('compendium.copy.cancel'),
      fields: [
        {
          id: 'includeLinked',
          type: 'checkbox',
          value: true,
          checkboxLabel: this.translateService.instant('compendium.linked.include', {
            count: plan.linked.length,
          }),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const includeLinked = form.getValues()['includeLinked'] !== false;
          void this.copy(path, target, null, includeLinked, subfolder, onCopied).then((isDone) => {
            isSubmitting = false;
            if (isDone) {
              dialogRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  /** Resolves when the copy flow is over for this sheet (copied, or handed over to the rename sheet). */
  private async copy(
    path: string,
    target: CopyTarget,
    fileName: string | null,
    includeLinked: boolean,
    subfolder: string | null,
    onCopied?: () => void,
  ): Promise<boolean> {
    try {
      const result = await this.documentService.copy({
        path,
        target: target.value,
        fileName,
        includeLinked,
        subfolder,
      });
      if (result.status === 'exists') {
        this.openRenameSheet(path, target, result.path, includeLinked, subfolder, onCopied);
        return true;
      }

      if (target.value === this.compendiumService.activeSystem()?.path) {
        await this.compendiumService.refreshActive();
      }
      onCopied?.();

      const route = toInAppNoteRoute(result.path) ?? this.getFolderRoute(result.path);
      toast.success(
        this.translateService.instant(
          result.linkedPaths.length > 0 ? 'compendium.copy.doneWithLinked' : 'compendium.copy.done',
          { target: target.label, count: result.linkedPaths.length },
        ),
        {
          description: result.path,
          classes: route ? { actionButton: toastOpenActionClass } : undefined,
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

  private openRenameSheet(
    path: string,
    target: CopyTarget,
    takenPath: string,
    includeLinked: boolean,
    subfolder: string | null,
    onCopied?: () => void,
  ): void {
    const location = parseVaultFilePath(path);
    const baseName = (location?.name ?? path.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
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
          const fileName = String(form.getValues()['fileName'] ?? '');
          void this.copy(path, target, fileName, includeLinked, subfolder, onCopied).then(
            (isDone) => {
              isSubmitting = false;
              if (isDone) {
                dialogRef.close();
              }
            },
          );
        }

        return false;
      },
    });
  }

  /** Systems (to copy into the compendium) or campaigns (to copy out of it); null after an error toast. */
  private async loadTargets(toCompendium: boolean): Promise<readonly CopyTarget[] | null> {
    try {
      return toCompendium
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
      return null;
    }
  }

  private getFolderRoute(path: string): string | null {
    const location = parseVaultFilePath(path);
    return location ? `${location.scopeRoute}/${location.section}` : null;
  }
}
