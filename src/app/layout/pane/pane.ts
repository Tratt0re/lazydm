import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { VaultActivityBannerComponent } from '@/components/vault-activity-banner/vault-activity-banner.component';
import { VaultSyncStatusComponent } from '@/components/vault-sync-status/vault-sync-status.component';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { LayoutImports } from '@/shared/components/layout/layout.imports';
import { TabBar } from '../tab-bar/tab-bar';
import { Toolbar } from '../toolbar/toolbar';
import { createPaneRouter, PaneState, PRIMARY_PANE_OUTLET } from './pane-router';

/**
 * One side of the workspace: its tab bar, toolbar and page. It provides its own toolbar context, so the page
 * shown in it (and only that page) fills its toolbar, and it tells the workspace the title of that page.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pane',
  imports: [
    ...LayoutImports,
    RouterOutlet,
    TabBar,
    Toolbar,
    VaultActivityBannerComponent,
    VaultSyncStatusComponent,
  ],
  providers: [
    ToolbarContextService,
    PaneState,
    // The pages of a pane ask for the `Router` and get one that keeps their navigation in this pane's outlet.
    {
      provide: Router,
      useFactory: () => createPaneRouter(inject(Router, { skipSelf: true }), inject(PaneState)),
    },
  ],
  templateUrl: './pane.html',
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col',
  },
})
export class Pane {
  /** Router outlet of this pane's page: the main one, or `split` for the second pane. */
  readonly outlet = input(PRIMARY_PANE_OUTLET);
  readonly sidebarCollapsed = input(false);
  readonly sidebarToggle = output<void>();

  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly workspace = inject(WorkspaceService);
  private readonly state = inject(PaneState);
  protected readonly isFirstPane = computed(() => this.outlet() === PRIMARY_PANE_OUTLET);
  protected readonly toolbarTitle = this.toolbarContext.title;
  protected readonly toolbarTitleMode = this.toolbarContext.titleMode;
  protected readonly toolbarTitleBreadcrumbs = this.toolbarContext.titleBreadcrumbs;
  protected readonly toolbarItemActions = this.toolbarContext.itemActions;
  protected readonly toolbarItemNavigation = this.toolbarContext.itemNavigation;

  constructor() {
    effect(() => this.state.outlet.set(this.outlet()));
    effect(() => {
      const title = this.toolbarContext.title();
      // Tab titles of the second pane come with the per-pane workspace (D1b).
      if (title && this.isFirstPane()) {
        this.workspace.reportTitle(title);
      }
    });
  }
}
