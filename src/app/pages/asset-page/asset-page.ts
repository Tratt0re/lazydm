import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  toAssetUrl,
  toInAppAssetRoute,
} from '@/components/document-preview/document-preview.markdown';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import { CopyToService } from '@/services/copy-to.service';
import { FileActionsService } from '@/services/file-actions.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';

/** File name of the image (with its extension), from the route. */
export const ASSET_FILE_PARAM = 'file';
const ASSET_SUBFOLDER_PARAM = 'subfolder';

/**
 * An image asset on its own, fitted to the page: the toolbar renames it (links follow) or copies it to the
 * compendium / a campaign. Opened from the section page and the explorer.
 */
@Component({
  selector: 'app-asset-page',
  imports: [TranslatePipe, ArcTechAlertComponent],
  templateUrl: './asset-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class AssetPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scope = inject(NoteScopeService).scopeOf(getNoteScopeKind(this.route));
  private readonly sectionService = inject(SectionService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly translateService = inject(TranslateService);
  private readonly fileActions = inject(FileActionsService);
  private readonly copyTo = inject(CopyToService);
  private readonly workspace = inject(WorkspaceService);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly sectionKey = computed(() => this.params().get(CAMPAIGN_SECTION_PARAM) ?? '');
  private readonly subfolder = computed(() => this.params().get(ASSET_SUBFOLDER_PARAM));
  protected readonly fileName = computed(() => this.params().get(ASSET_FILE_PARAM) ?? '');

  /** Vault-relative path of the image. */
  protected readonly assetPath = computed(() => {
    const folder = this.subfolder()
      ? `${this.sectionKey()}/${this.subfolder()}`
      : this.sectionKey();
    return `${this.scope()?.rootPath ?? ''}/${folder}/${this.fileName()}`;
  });
  protected readonly imageUrl = computed(() => toAssetUrl(this.assetPath()));
  /** The image could not be loaded (gone, renamed elsewhere, not an image after all). */
  protected readonly hasLoadError = signal(false);

  constructor() {
    // A new image (another asset, or this one renamed) gets a fresh chance to load.
    effect(() => {
      this.imageUrl();
      this.hasLoadError.set(false);
    });

    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      const sectionPath = `${scope.routeBase}/${this.sectionKey()}`;
      const subfolder = this.subfolder();
      onCleanup(
        this.toolbarContext.activate({
          title: this.fileName(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: scope.name, path: scope.routeBase, translate: false },
            {
              label: this.sectionService.labelOfKey(this.sectionKey(), scope.kind),
              path: sectionPath,
              translate: false,
            },
            ...(subfolder
              ? [
                  {
                    label: toSubfolderLabel(subfolder),
                    path: sectionPath,
                    queryParams: { folder: subfolder },
                    translate: false,
                  },
                ]
              : []),
          ],
          itemActions: [
            {
              id: 'copy',
              label: this.translateService.instant(
                scope.kind === 'system'
                  ? 'compendium.copy.toCampaign'
                  : 'compendium.copy.toCompendium',
              ),
              icon: 'copy-plus',
              buttonType: 'outline',
              iconOnly: true,
              action: () => void this.copyTo.openCopySheet(this.assetPath()),
            },
            {
              id: 'rename',
              label: this.translateService.instant('campaigns.sections.renameAsset.menu'),
              icon: 'text-cursor-input',
              buttonType: 'outline',
              iconOnly: true,
              action: () => this.openRenameSheet(),
            },
            {
              id: 'delete',
              label: this.translateService.instant('files.delete.menu'),
              icon: 'trash',
              buttonType: 'outline',
              iconOnly: true,
              action: () => this.openDeleteSheet(),
            },
          ],
        }),
      );
    });
  }

  protected onImageError(): void {
    this.hasLoadError.set(true);
  }

  /** *Rename*: the links follow; the page (and its tab, in a campaign) moves to the new file name. */
  private openRenameSheet(): void {
    const oldPath = this.assetPath();
    void this.fileActions.openRenameAssetSheet(
      { path: oldPath, name: this.fileName() },
      (newPath) => void this.followRename(oldPath, newPath),
    );
  }

  /** *Delete…* (to the system Trash); the page, and its tab in a campaign, go to the folder page. */
  private openDeleteSheet(): void {
    void this.fileActions.openDeleteSheet(
      { path: this.assetPath(), label: this.fileName(), isNote: false },
      (folderRoute) => {
        if (folderRoute && this.scope()?.kind === 'system') {
          void this.router.navigateByUrl(folderRoute, { replaceUrl: true });
        }
      },
    );
  }

  private async followRename(oldPath: string, newPath: string): Promise<void> {
    const oldRoute = toInAppAssetRoute(oldPath);
    const newRoute = toInAppAssetRoute(newPath);
    if (!oldRoute || !newRoute || oldRoute === newRoute) {
      return;
    }

    if (this.scope()?.kind === 'system') {
      await this.router.navigateByUrl(newRoute, { replaceUrl: true });
    } else {
      await this.workspace.replaceUrl(oldRoute, newRoute);
    }
  }
}
