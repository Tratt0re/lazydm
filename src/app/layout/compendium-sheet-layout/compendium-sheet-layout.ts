import { ChangeDetectionStrategy, Component, computed, inject, type OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import {
  AppExplorerTreeComponent,
  type ExplorerNode,
} from '@/components/explorer-tree/explorer-tree.component';
import { APP_SHEET_OUTLET, AppSheetService } from '@/services/app-sheet.service';
import { SectionService } from '@/services/section.service';
import { CompendiumService } from '@/services/compendium.service';
import { ArcTechIconComponent } from '@/shared/components/icon';

/**
 * The Compendium sheet: the explorer sidebar (All systems, then each system — ↗ is its overview — with the
 * folders it has) next to the compendium pages. Below the two-column breakpoint the sidebar collapses into one
 * bar showing where the sheet is, like the Settings and Templates sidebars.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-compendium-sheet-layout',
  imports: [RouterOutlet, TranslatePipe, AppExplorerTreeComponent, ArcTechIconComponent],
  template: `
    <div
      class="grid min-h-0 flex-1 content-start gap-4 p-6 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:content-normal"
    >
      <div class="flex flex-col border border-border bg-recessed lg:min-h-0 lg:overflow-y-auto">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-left text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring lg:hidden"
          [class.border-b]="isBarOpen()"
          [class.border-border]="isBarOpen()"
          [attr.aria-expanded]="isBarOpen()"
          (click)="isBarOpen.set(!isBarOpen())"
        >
          <arc-icon
            arcType="chevron-right"
            class="size-3.5 shrink-0 text-primary transition-transform duration-150"
            [class.rotate-90]="isBarOpen()"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.06em] uppercase">
            <span class="text-muted-foreground">{{ 'nav.items.compendium' | translate }} · </span>
            {{ currentLabel() }}<span class="text-primary" aria-hidden="true">.</span>
          </span>
        </button>
        <app-explorer-tree
          [class]="'p-2 lg:block ' + (isBarOpen() ? 'block' : 'hidden')"
          [nodes]="explorerNodes()"
          [outlet]="sheetOutlet"
          stateKey="compendium"
          [ariaLabel]="'compendium.sidebarAriaLabel' | translate"
          (navigated)="isBarOpen.set(false)"
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
  private readonly sheets = inject(AppSheetService);
  private readonly translateService = inject(TranslateService);
  protected readonly sheetOutlet = APP_SHEET_OUTLET;
  /** Narrow screens only: the explorer is shown under the bar. */
  protected readonly isBarOpen = signal(false);
  /** Where the sheet is, for the narrow-screen bar: all systems, a system, or a system's folder. */
  protected readonly currentLabel = computed(() => {
    const [, slug, folder] = this.sheets.sheetPath().split('/');
    const system = slug ? this.compendiumService.systems().find((item) => item.slug === slug) : null;
    if (!system) {
      return this.translateService.instant('compendium.list.allSystems');
    }

    return folder && folder !== 'review'
      ? `${system.name} / ${this.sectionService.labelOfKey(folder, 'system')}`
      : system.name;
  });

  protected readonly explorerNodes = computed<readonly ExplorerNode[]>(() => [
    {
      key: 'all',
      label: 'compendium.list.allSystems',
      icon: 'square-library',
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
