import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Toolbar } from '@/layout/toolbar/toolbar';
import { ToolbarContextService } from '@/services/toolbar-context.service';

/**
 * A compendium system inside the Compendium sheet: its own toolbar (breadcrumb, note actions) over the
 * system pages; the folders are in the sheet's cascading sidebar. Shares nothing with the campaign.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-system-sheet-layout',
  imports: [RouterOutlet, Toolbar],
  providers: [ToolbarContextService],
  template: `
    <app-toolbar
      [showSidebarToggle]="false"
      [title]="toolbar.title()"
      [titleMode]="toolbar.titleMode()"
      [titleBreadcrumbs]="toolbar.titleBreadcrumbs()"
      [itemActions]="toolbar.itemActions()"
      [itemNavigation]="toolbar.itemNavigation()"
    ></app-toolbar>

    <div class="flex min-h-0 flex-1 flex-col overflow-auto p-6">
      <router-outlet />
    </div>
  `,
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class SystemSheetLayout {
  protected readonly toolbar = inject(ToolbarContextService);
}
