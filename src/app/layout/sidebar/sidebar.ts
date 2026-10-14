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

import {
  AppExplorerTreeComponent,
  type ExplorerNode,
} from '@/components/explorer-tree/explorer-tree.component';
import { CampaignService } from '@/services/campaign.service';
import { ArcTechIconComponent } from '@/shared/components/icon';
import {
  SidebarComponent,
  SidebarGroupComponent,
  SidebarGroupLabelComponent,
} from '@/shared/components/layout/sidebar.component';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { mergeClasses } from '@/shared/utils/merge-classes';
import { UpdateService } from '@/shared/core/services/update.service';

import type { MenuSectionConfig } from '@/config/menu.config';

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
    AppExplorerTreeComponent,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './sidebar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Sidebar {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly updateService = inject(UpdateService);
  private readonly campaignService = inject(CampaignService);
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
  /** The top sections as explorer rows: campaign sections are folders, the rest (Overview) plain links. */
  protected readonly topExplorerNodes = computed(() => {
    const slug = this.campaignService.activeCampaign()?.slug ?? null;
    return this.topMenuSections().map((section) =>
      section.items.map<ExplorerNode>((item) => ({
        key: item.sectionKey ?? item.path,
        label: item.label,
        translate: item.translate,
        icon: item.icon,
        route: item.path,
        path: item.sectionKey && slug ? `${slug}/${item.sectionKey}` : undefined,
      })),
    );
  });
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

  constructor() {
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

  private clearCollapseTransitionTimer(): void {
    if (!this.collapseTransitionTimer) {
      return;
    }

    globalThis.clearTimeout(this.collapseTransitionTimer);
    this.collapseTransitionTimer = undefined;
  }
}
