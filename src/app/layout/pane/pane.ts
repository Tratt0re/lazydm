import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { VaultActivityBannerComponent } from '@/components/vault-activity-banner/vault-activity-banner.component';
import { VaultSyncStatusComponent } from '@/components/vault-sync-status/vault-sync-status.component';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { LayoutImports } from '@/shared/components/layout/layout.imports';
import { TabBar } from '../tab-bar/tab-bar';
import { Toolbar } from '../toolbar/toolbar';

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
  providers: [ToolbarContextService],
  templateUrl: './pane.html',
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col',
  },
})
export class Pane {
  readonly sidebarCollapsed = input(false);
  readonly sidebarToggle = output<void>();

  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly workspace = inject(WorkspaceService);

  protected readonly toolbarTitle = this.toolbarContext.title;
  protected readonly toolbarTitleMode = this.toolbarContext.titleMode;
  protected readonly toolbarTitleBreadcrumbs = this.toolbarContext.titleBreadcrumbs;
  protected readonly toolbarItemActions = this.toolbarContext.itemActions;
  protected readonly toolbarItemNavigation = this.toolbarContext.itemNavigation;

  constructor() {
    effect(() => {
      const title = this.toolbarContext.title();
      if (title) {
        this.workspace.reportTitle(title);
      }
    });
  }
}
