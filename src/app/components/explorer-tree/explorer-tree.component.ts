import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { filter, map } from 'rxjs';

import {
  toInAppAssetRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import type { DocumentFileListItemDto, DocumentFolderDto } from '@/dtos';
import { CopyToService } from '@/services/copy-to.service';
import { DocumentService } from '@/services/document.service';
import { FileActionsService } from '@/services/file-actions.service';
import { FileMoveService } from '@/services/file-move.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { type AppSection, SectionService, toSubfolderLabel } from '@/services/section.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { mergeClasses } from '@/shared/utils/merge-classes';

/** Query parameter of the sub-folder a section page shows (`?folder=humans`). */
const FOLDER_QUERY_PARAM = 'folder';

/**
 * A row of the explorer. With `children` it is a static folder (a compendium system and its sections); with a
 * `path` and no children it is a section folder, loading its sub-folders and files when expanded; with neither it
 * is a plain link (Overview, All systems).
 */
export interface ExplorerNode {
  readonly key: string;
  /** i18n key, or the text itself when `translate` is false. */
  readonly label: string;
  readonly translate?: boolean;
  readonly icon: ArcTechIcon;
  /** Page of the node: the ↗ button and *Open page* go there. */
  readonly route: string;
  /** Vault-relative folder (`lost-mine/enemies`, `compendium/srd`): loaded as a section, and *Reveal*. */
  readonly path?: string;
  readonly children?: readonly ExplorerNode[];
}

interface SectionTree {
  readonly files: readonly DocumentFileListItemDto[];
  readonly folders: readonly (DocumentFolderDto & { files: readonly DocumentFileListItemDto[] })[];
}

/**
 * Explorer sidebar (campaign shell, Compendium sheet): a file tree like a code editor's. Folder rows expand on
 * click; the ↗ button on their right opens the folder's page. Files open the note. Right-click: *Move to…* and
 * *Reveal* on files (*Copy to…* on assets), *Open page* and *Reveal* on folders, with *New note* and *New
 * folder* where the folder takes them. The folder holding the open page
 * expands by itself; with a `stateKey` the open folders are remembered on this device.
 */
@Component({
  selector: 'app-explorer-tree',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechTooltipImports,
  ],
  templateUrl: './explorer-tree.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppExplorerTreeComponent {
  private readonly router = inject(Router);
  private readonly documentService = inject(DocumentService);
  private readonly translateService = inject(TranslateService);
  protected readonly fileMove = inject(FileMoveService);
  protected readonly copyTo = inject(CopyToService);
  private readonly fileActions = inject(FileActionsService);
  protected readonly workspace = inject(WorkspaceService);
  private readonly localPreferences = inject(LocalPreferencesService);
  private readonly sectionService = inject(SectionService);
  protected readonly toSubfolderLabel = toSubfolderLabel;

  readonly nodes = input.required<readonly ExplorerNode[]>();
  /** Router outlet whose URL marks the active row: `primary` (campaign) or the sheet outlet (Compendium). */
  readonly outlet = input('primary');
  readonly ariaLabel = input('');
  /** Remembers the open folders under this key (`campaign:<slug>`, `compendium`); null keeps them in memory. */
  readonly stateKey = input<string | null>(null);

  /** A link of the tree was followed (lets a small-screen sidebar close itself). */
  readonly navigated = output<void>();

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** Path of the outlet (`/campaigns/lost-mine/enemies`) and the sub-folder query, if any. */
  private readonly location = computed(() => {
    const tree = this.router.parseUrl(this.url());
    const segments = tree.root.children[this.outlet()]?.segments ?? [];
    const folder = tree.queryParams[FOLDER_QUERY_PARAM];
    return {
      path: `/${segments.map((segment) => segment.path).join('/')}`,
      folder: typeof folder === 'string' ? folder : null,
    };
  });

  /** Expanded rows: node keys, and `<section key>/<sub-folder>` for sub-folders. */
  private readonly expandedKeys = signal<ReadonlySet<string>>(new Set());
  /** Loaded section trees, by section path. */
  private readonly trees = signal<ReadonlyMap<string, SectionTree>>(new Map());
  /** Section paths being loaded (not a signal: only guards against loading twice). */
  private readonly loadingPaths = new Set<string>();

  private readonly handleIndexUpdated = () => {
    for (const path of this.trees().keys()) {
      void this.loadTree(path);
    }
  };

  constructor() {
    window.electronAPI?.onIpcEvent?.('index:updated', this.handleIndexUpdated);
    inject(DestroyRef).onDestroy(() =>
      window.electronAPI?.offIpcEvent?.('index:updated', this.handleIndexUpdated),
    );

    // The folders left open last time (before revealing the open page, which adds to them).
    effect(() => {
      const stateKey = this.stateKey();
      untracked(() =>
        this.expandedKeys.set(
          new Set(stateKey ? this.localPreferences.getExplorerExpanded(stateKey) : []),
        ),
      );
    });

    // Reveal the open page: expand every folder on its way (on navigation only, so a collapse sticks).
    effect(() => {
      const location = this.location();
      const nodes = this.nodes();
      untracked(() => this.revealLocation(nodes, location.path, location.folder));
    });

    effect(() => {
      const keys = this.expandedKeys();
      const stateKey = untracked(() => this.stateKey());
      if (stateKey) {
        this.localPreferences.setExplorerExpanded(stateKey, [...keys]);
      }
    });

    // Every open section shows its files: load the ones not loaded yet.
    effect(() => {
      const keys = this.expandedKeys();
      const trees = this.trees();
      const visit = (items: readonly ExplorerNode[]) => {
        for (const node of items) {
          if (node.children) {
            visit(node.children);
          } else if (node.path && keys.has(node.key) && !trees.has(node.path)) {
            void this.loadTree(node.path);
          }
        }
      };
      visit(this.nodes());
    });
  }

  protected labelOf(node: ExplorerNode): string {
    return node.translate === false ? node.label : this.translateService.instant(node.label);
  }

  /** A row: top-level rows in the sidebar's label style, nested ones lighter; the active one raised in bronze. */
  protected rowClass(isActive: boolean, isTop: boolean): string {
    return mergeClasses(
      'group flex h-8 min-w-0 items-center border-l-2 font-mono text-[11px] tracking-[0.04em] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
      isTop ? 'h-10 font-semibold' : 'font-medium',
      isActive
        ? 'border-l-sidebar-primary bg-raised text-sidebar-primary'
        : 'border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    );
  }

  protected isExpanded(key: string): boolean {
    return this.expandedKeys().has(key);
  }

  protected toggle(key: string): void {
    const next = new Set(this.expandedKeys());
    if (!next.delete(key)) {
      next.add(key);
    }
    this.expandedKeys.set(next);
  }

  /** New tabs hold campaign pages only (the Compendium opens in its sheet). */
  protected canOpenInTab(route: string | null): route is string {
    return !!route && this.workspace.isCampaignUrl(route);
  }

  protected treeOf(node: ExplorerNode): SectionTree | null {
    return node.path ? (this.trees().get(node.path) ?? null) : null;
  }

  protected isActive(route: string, folder: string | null = null): boolean {
    const location = this.location();
    return location.path === route && location.folder === folder;
  }

  protected noteRoute(file: DocumentFileListItemDto): string | null {
    return toInAppNoteRoute(file.path);
  }

  /**
   * The section a folder row is (campaign `<slug>/<section>`, compendium `compendium/<system>/<section>`), for
   * what can be created in it; null for other rows (a system, static folders, plain links).
   */
  protected sectionOf(node: ExplorerNode): AppSection | null {
    if (!node.path || node.children) {
      return null;
    }

    const segments = node.path.split('/');
    const isSystem = segments[0] === 'compendium';
    if (segments.length !== (isSystem ? 3 : 2)) {
      return null;
    }

    const key = segments[segments.length - 1];
    return isSystem
      ? this.sectionService.findSystemSection(key)
      : this.sectionService.findCampaignSection(key);
  }

  /** Notes go in sections with a note type (not assets or encounters), and in their sub-folders. */
  protected canCreateNote(section: AppSection | null): boolean {
    return !!section?.type && !section.isSpecial;
  }

  /** *New note* in a section or one of its sub-folders: opens the new note. */
  protected openCreateNoteSheet(node: ExplorerNode, section: AppSection, folder?: string): void {
    if (node.path && section.type) {
      this.fileActions.openCreateNoteSheet({
        path: folder ? `${node.path}/${folder}` : node.path,
        type: section.type,
        sectionLabel: this.labelOf(node),
      });
    }
  }

  /** *New folder* in a section (one level): the section opens on it once created. */
  protected openCreateFolderSheet(node: ExplorerNode, section: AppSection): void {
    const path = node.path;
    if (!path) {
      return;
    }

    this.fileActions.openCreateFolderSheet(
      { path, label: this.labelOf(node), isSpecial: section.isSpecial },
      (name) => {
        this.expandedKeys.set(new Set(this.expandedKeys()).add(node.key).add(`${node.key}/${name}`));
        void this.loadTree(path);
      },
    );
  }

  /** *Rename…* a sub-folder (sub-type and links follow); the tree follows the index update. */
  protected openRenameFolderSheet(folderPath: string, folder: DocumentFolderDto): void {
    void this.fileActions.openRenameFolderSheet({
      path: folderPath,
      label: toSubfolderLabel(folder.name),
      fileCount: folder.fileCount,
    });
  }

  /** *Delete…* a sub-folder (files moved to the main folder, or deleted too); the tree follows the index. */
  protected openDeleteFolderSheet(folderPath: string, folder: DocumentFolderDto): void {
    void this.fileActions.openDeleteFolderSheet({
      path: folderPath,
      label: toSubfolderLabel(folder.name),
      fileCount: folder.fileCount,
    });
  }

  /** *Rename…* a note (its title) or an asset (its name); the tree follows the index update. */
  protected openRenameSheet(file: DocumentFileListItemDto): void {
    if (file.kind === 'md') {
      void this.fileActions.openRenameNoteSheet({ path: file.path, title: file.title });
    } else {
      void this.fileActions.openRenameAssetSheet(file);
    }
  }

  /** *Delete…* a note or an asset (to the system Trash); the tree follows the index update. */
  protected openDeleteSheet(file: DocumentFileListItemDto): void {
    const isNote = file.kind === 'md';
    void this.fileActions.openDeleteSheet({
      path: file.path,
      label: isNote ? file.title : file.name,
      isNote,
    });
  }

  /** Icon of an asset in the tree: image, sound or PDF. */
  protected assetIcon(file: DocumentFileListItemDto): 'image' | 'file-music' | 'file-text' {
    if (/\.pdf$/i.test(file.path)) {
      return 'file-text';
    }
    return toInAppAssetRoute(file.path) && !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(file.path)
      ? 'file-music'
      : 'image';
  }

  /** Asset page of an image or a sound (null for any other asset). */
  protected assetRoute(file: DocumentFileListItemDto): string | null {
    return toInAppAssetRoute(file.path);
  }

  /** The sub-folder of the section a file is in (`null` directly in it): where an asset row links to. */
  protected folderQueryOf(
    node: ExplorerNode,
    file: DocumentFileListItemDto,
  ): Record<string, string> {
    const folder = node.path ? this.fileMove.folderOf(file.path, node.path) : '';
    return folder ? { [FOLDER_QUERY_PARAM]: folder } : {};
  }

  protected copyLabel(file: DocumentFileListItemDto): string {
    return this.copyTo.isInCompendium(file.path)
      ? 'compendium.copy.toCampaign'
      : 'compendium.copy.toCompendium';
  }

  protected openMoveSheet(node: ExplorerNode, file: DocumentFileListItemDto): void {
    const path = node.path;
    if (!path) {
      return;
    }

    this.fileMove.openMoveSheet(
      file,
      {
        path,
        label: this.labelOf(node),
        folders: this.treeOf(node)?.folders.map((folder) => folder.name) ?? [],
      },
      () => void this.loadTree(path),
    );
  }

  private revealLocation(
    nodes: readonly ExplorerNode[],
    path: string,
    folder: string | null,
  ): void {
    const keys = new Set(this.expandedKeys());
    const visit = (items: readonly ExplorerNode[]) => {
      for (const node of items) {
        const isInside = path === node.route || path.startsWith(`${node.route}/`);
        if (!isInside || (!node.children && !node.path)) {
          continue;
        }

        if (node.children) {
          if (path !== node.route) {
            keys.add(node.key);
          }
          visit(node.children);
          continue;
        }

        // A section: open on its notes and sub-folder pages, not on the section page itself.
        const rest = path
          .slice(node.route.length + 1)
          .split('/')
          .filter(Boolean);
        const subfolder = rest.length === 2 ? rest[0] : path === node.route ? folder : null;
        if (rest.length > 0 || subfolder) {
          keys.add(node.key);
          if (subfolder) {
            keys.add(`${node.key}/${subfolder}`);
          }
        }
      }
    };

    visit(nodes);
    if (keys.size !== this.expandedKeys().size) {
      this.expandedKeys.set(keys);
    }
  }

  private async loadTree(path: string): Promise<void> {
    if (this.loadingPaths.has(path)) {
      return;
    }

    this.loadingPaths.add(path);
    try {
      const tree = await this.documentService.listSectionTree(path);
      const next = new Map(this.trees());
      next.set(path, tree);
      this.trees.set(next);
    } catch (error) {
      console.warn('[app] Failed to load the explorer folder:', path, error);
    } finally {
      this.loadingPaths.delete(path);
    }
  }
}
