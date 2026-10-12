import { Component, computed, inject, type OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  AppSecondarySidebarComponent,
  type SecondarySidebarItem,
} from '@/components/secondary-sidebar/secondary-sidebar.component';
import { CAMPAIGN_SECTIONS, COMPENDIUM_EXTRA_SECTIONS } from '@/config/menu.config';
import { AppSheetService } from '@/services/app-sheet.service';
import { CompendiumService } from '@/services/compendium.service';

const ALL_SYSTEMS_KEY = 'all';

/**
 * The Compendium sheet: a cascading sidebar (all systems, then each system with its overview and the
 * folders it has) next to the compendium pages.
 */
@Component({
  selector: 'app-compendium-sheet-layout',
  imports: [RouterOutlet, TranslatePipe, AppSecondarySidebarComponent],
  template: `
    <div class="grid min-h-0 flex-1 gap-4 p-6 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <app-secondary-sidebar
        [items]="sidebarItems()"
        [activeKey]="activeKey()"
        [ariaLabel]="'compendium.sidebarAriaLabel' | translate"
      />
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
  private readonly sheets = inject(AppSheetService);

  protected readonly sidebarItems = computed<readonly SecondarySidebarItem[]>(() => [
    {
      key: ALL_SYSTEMS_KEY,
      label: 'compendium.list.allSystems',
      description: 'compendium.list.allSystemsDescription',
      route: '/compendium',
    },
    ...this.compendiumService.systems().map((system) => ({
      key: system.slug,
      label: system.name,
      description: system.description,
      translate: false,
      children: [
        {
          key: `${system.slug}/`,
          label: 'nav.items.overview',
          icon: 'layout-dashboard' as const,
          route: `/compendium/${system.slug}`,
        },
        ...[...CAMPAIGN_SECTIONS, ...COMPENDIUM_EXTRA_SECTIONS]
          .filter((section) => system.folders.includes(section.key))
          .map((section) => ({
            key: `${system.slug}/${section.key}`,
            label: `nav.items.${section.key}`,
            icon: section.icon,
            route: `/compendium/${system.slug}/${section.key}`,
          })),
      ],
    })),
  ]);

  /** `compendium/<system>/<folder>/...` gives `<system>/<folder>`; the systems grid gives `all`. */
  protected readonly activeKey = computed(() => {
    const [, system, folder] = this.sheets.sheetPath().split('/');
    if (!system) {
      return ALL_SYSTEMS_KEY;
    }

    return folder && folder !== 'broken-links' ? `${system}/${folder}` : `${system}/`;
  });

  ngOnInit(): void {
    this.compendiumService.loadSystems().catch((error: unknown) => {
      console.warn('[app] Failed to load compendium systems:', error);
    });
  }
}
