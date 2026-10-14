import { Component, computed, inject, type OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  AppExplorerTreeComponent,
  type ExplorerNode,
} from '@/components/explorer-tree/explorer-tree.component';
import { APP_SHEET_OUTLET } from '@/services/app-sheet.service';
import { SectionService } from '@/services/section.service';
import { CompendiumService } from '@/services/compendium.service';

/**
 * The Compendium sheet: the explorer sidebar (All systems, then each system — ↗ is its overview — with the
 * folders it has) next to the compendium pages.
 */
@Component({
  selector: 'app-compendium-sheet-layout',
  imports: [RouterOutlet, TranslatePipe, AppExplorerTreeComponent],
  template: `
    <div class="grid min-h-0 flex-1 gap-4 p-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <div class="max-h-72 min-h-0 overflow-y-auto border border-border bg-recessed p-2 lg:max-h-none">
        <app-explorer-tree
          [nodes]="explorerNodes()"
          [outlet]="sheetOutlet"
          [ariaLabel]="'compendium.sidebarAriaLabel' | translate"
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-col overflow-auto border border-border bg-background">
        <router-outlet />
      </div>
    </div>
  `,
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class CompendiumSheetLayout implements OnInit {
  private readonly compendiumService = inject(CompendiumService);
  private readonly sectionService = inject(SectionService);
  protected readonly sheetOutlet = APP_SHEET_OUTLET;

  protected readonly explorerNodes = computed<readonly ExplorerNode[]>(() => [
    {
      key: 'all',
      label: 'compendium.list.allSystems',
      icon: 'library-big',
      route: '/compendium',
    },
    ...this.compendiumService.systems().map<ExplorerNode>((system) => ({
      key: system.slug,
      label: system.name,
      translate: false,
      icon: 'book-open',
      route: `/compendium/${system.slug}`,
      path: system.path,
      children: this.sectionService
        .systemSections()
        .filter((section) => system.folders.includes(section.key))
        .map((section) => ({
          key: `${system.slug}/${section.key}`,
          label: `nav.items.${section.key}`,
          icon: section.icon,
          route: `/compendium/${system.slug}/${section.key}`,
          path: `${system.path}/${section.key}`,
        })),
    })),
  ]);

  ngOnInit(): void {
    this.compendiumService.loadSystems().catch((error: unknown) => {
      console.warn('[app] Failed to load compendium systems:', error);
    });
  }
}
