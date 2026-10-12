import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MenuConfiguration } from '@/config/menu.config';
import { Sidebar } from '@/layout/sidebar/sidebar';
import { Toolbar } from '@/layout/toolbar/toolbar';
import { CompendiumService } from '@/services/compendium.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';

/**
 * A compendium system inside the Compendium sheet: sidebar with the folders it has, its own toolbar
 * (breadcrumb, note actions) and the system pages. Shares nothing with the campaign underneath.
 */
@Component({
  selector: 'app-system-sheet-layout',
  imports: [RouterOutlet, Sidebar, Toolbar],
  providers: [ToolbarContextService],
  template: `
    <div class="flex h-full min-h-0 border-t border-border">
      <app-sidebar
        [menuSections]="menuSections()"
        [isSmallScreen]="false"
        [sidebarCollapsed]="sidebarCollapsed()"
        (sidebarCollapsedChange)="sidebarCollapsed.set($event)"
      ></app-sidebar>

      <div class="flex min-w-0 flex-1 flex-col">
        <app-toolbar
          [sidebarCollapsed]="sidebarCollapsed()"
          [title]="toolbar.title()"
          [titleMode]="toolbar.titleMode()"
          [titleBreadcrumbs]="toolbar.titleBreadcrumbs()"
          [itemActions]="toolbar.itemActions()"
          [itemNavigation]="toolbar.itemNavigation()"
          (sidebarToggle)="sidebarCollapsed.set(!sidebarCollapsed())"
        ></app-toolbar>

        <div class="flex min-h-0 flex-1 flex-col overflow-auto bg-background p-6">
          <router-outlet />
        </div>
      </div>
    </div>
  `,
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class SystemSheetLayout {
  private readonly compendiumService = inject(CompendiumService);
  protected readonly toolbar = inject(ToolbarContextService);
  protected readonly sidebarCollapsed = signal(false);
  protected readonly menuSections = computed(() => {
    const system = this.compendiumService.activeSystem();
    return system ? MenuConfiguration.forSystem(system.slug, system.folders) : [];
  });
}
