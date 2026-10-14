import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import type { DocumentFileListItemDto, DocumentFolderDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import { DocumentService } from '@/services/document.service';
import { toSubfolderLabel } from '@/services/section.service';
import { ArcTechIconComponent } from '@/shared/components/icon';
import {
  SidebarComponent,
  SidebarGroupComponent,
  SidebarGroupLabelComponent,
} from '@/shared/components/layout/sidebar.component';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { mergeClasses } from '@/shared/utils/merge-classes';
import { UpdateService } from '@/shared/core/services/update.service';

import type { MenuItemConfig, MenuSectionConfig } from '@/config/menu.config';

/** A section's folder tree as the sidebar shows it: its own files, and its sub-folders with theirs. */
interface SidebarSectionTree {
  readonly files: readonly DocumentFileListItemDto[];
  readonly folders: readonly (DocumentFolderDto & { files: readonly DocumentFileListItemDto[] })[];
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    A11yModule,
    TranslatePipe,
    ArcTechIconComponent,
    SidebarComponent,
    SidebarGroupComponent,
    SidebarGroupLabelComponent,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Sidebar {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly updateService = inject(UpdateService);
  private readonly campaignService = inject(CampaignService);
  private readonly documentService = inject(DocumentService);
  protected readonly toSubfolderLabel = toSubfolderLabel;
  private readonly collapseTransitionMs = 100;
  private collapseTransitionTimer?: ReturnType<typeof globalThis.setTimeout>;
  private previousCollapsed?: boolean;

  readonly menuSections = input.required<readonly MenuSectionConfig[]>();
  readonly isSmallScreen = input(false);
  readonly sidebarCollapsed = input(false);
  protected readonly isClosingCollapseTransition = signal(false);
  protected readonly topMenuSections = computed(() =>
    this.menuSections().filter((section) => section.placement !== 'bottom'),
  );
  protected readonly bottomMenuSections = computed(() =>
    this.menuSections().filter((section) => section.placement === 'bottom'),
  );
  protected readonly isSmallScreenCollapsed = computed(
    () => this.isSmallScreen() && this.sidebarCollapsed(),
  );
  protected readonly shouldTrapFocus = computed(
    () => this.isSmallScreen() && !this.sidebarCollapsed(),
  );

  readonly sidebarCollapsedChange = output<boolean>();

  /** Section keys expanded in the sidebar (`enemies`), and sub-folders inside them (`enemies/humans`). */
  private readonly expandedKeysSignal = signal<ReadonlySet<string>>(new Set());
  /** Loaded trees, by section key; cleared when the active campaign changes. */
  private readonly treesSignal = signal<ReadonlyMap<string, SidebarSectionTree>>(new Map());

  private readonly handleIndexUpdated = () => {
    const slug = this.campaignService.activeCampaign()?.slug;
    if (!slug) {
      return;
    }

    for (const key of this.treesSignal().keys()) {
      void this.loadTree(key, `${slug}/${key}`);
    }
  };

  constructor() {
    effect(() => {
      this.campaignService.activeCampaign();
      this.expandedKeysSignal.set(new Set());
      this.treesSignal.set(new Map());
    });

    window.electronAPI?.onIpcEvent?.('index:updated', this.handleIndexUpdated);
    this.destroyRef.onDestroy(() =>
      window.electronAPI?.offIpcEvent?.('index:updated', this.handleIndexUpdated),
    );

    effect(() => {
      const collapsed = this.sidebarCollapsed();

      if (this.previousCollapsed === undefined) {
        this.previousCollapsed = collapsed;
        return;
      }

      if (!this.previousCollapsed && collapsed) {
        this.isClosingCollapseTransition.set(true);
        this.clearCollapseTransitionTimer();
        this.collapseTransitionTimer = globalThis.setTimeout(() => {
          this.isClosingCollapseTransition.set(false);
          this.collapseTransitionTimer = undefined;
        }, this.collapseTransitionMs);
      } else if (this.previousCollapsed && !collapsed) {
        this.isClosingCollapseTransition.set(false);
        this.clearCollapseTransitionTimer();
      }

      this.previousCollapsed = collapsed;
    });

    this.destroyRef.onDestroy(() => this.clearCollapseTransitionTimer());
  }

  protected onSidebarCollapsedChange(isCollapsed: boolean): void {
    this.sidebarCollapsedChange.emit(isCollapsed);
  }

  protected onMenuItemClick(): void {
    if (this.isSmallScreen()) {
      this.sidebarCollapsedChange.emit(true);
    }
  }

  protected navItemClasses(isActive: boolean): string {
    return mergeClasses(
      'flex h-10 items-center rounded-none border px-3 font-mono text-[11px] font-semibold tracking-[0.04em] transition-colors duration-150',
      this.sidebarCollapsed() ? 'justify-center' : 'justify-start gap-3',
      isActive
        ? 'border-sidebar-border bg-raised text-sidebar-primary'
        : 'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    );
  }

  protected toggleSidebar(): void {
    this.sidebarCollapsedChange.emit(!this.sidebarCollapsed());
  }

  protected isExpanded(key: string): boolean {
    return this.expandedKeysSignal().has(key);
  }

  /** Expands a section item: loads its tree the first time, then just shows/hides it. */
  protected toggleSection(item: MenuItemConfig): void {
    const key = item.sectionKey;
    const slug = this.campaignService.activeCampaign()?.slug;
    if (!key || !slug) {
      return;
    }

    this.toggleKey(key);
    if (this.isExpanded(key) && !this.treesSignal().has(key)) {
      void this.loadTree(key, `${slug}/${key}`);
    }
  }

  protected toggleFolder(sectionKey: string, folderName: string): void {
    this.toggleKey(`${sectionKey}/${folderName}`);
  }

  /** Files directly in the section (empty while its tree has not loaded, or has none). */
  protected sectionFiles(key: string): readonly DocumentFileListItemDto[] {
    return this.treesSignal().get(key)?.files ?? [];
  }

  /** Sub-folders of the section, each with its own files. */
  protected sectionFolders(
    key: string,
  ): readonly (DocumentFolderDto & { files: readonly DocumentFileListItemDto[] })[] {
    return this.treesSignal().get(key)?.folders ?? [];
  }

  protected noteRoute(file: DocumentFileListItemDto): string | null {
    return toInAppNoteRoute(file.path);
  }

  private toggleKey(key: string): void {
    const next = new Set(this.expandedKeysSignal());
    if (!next.delete(key)) {
      next.add(key);
    }
    this.expandedKeysSignal.set(next);
  }

  private async loadTree(key: string, sectionPath: string): Promise<void> {
    try {
      const tree = await this.documentService.listSectionTree(sectionPath);
      const map = new Map(this.treesSignal());
      map.set(key, tree);
      this.treesSignal.set(map);
    } catch (error) {
      console.warn('[app] Failed to load the sidebar section tree:', sectionPath, error);
    }
  }

  private clearCollapseTransitionTimer(): void {
    if (!this.collapseTransitionTimer) {
      return;
    }

    globalThis.clearTimeout(this.collapseTransitionTimer);
    this.collapseTransitionTimer = undefined;
  }
}
