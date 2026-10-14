import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ArcTechIconComponent } from '@/shared/components/icon';
import type { ArcTechIcon } from '@/shared/components/icon';

/** One entry of a secondary sidebar; with `children` it is a branch that expands. */
export interface SecondarySidebarItem {
  readonly key: string;
  readonly label: string;
  /** Translate `label` / `description` (default true). */
  readonly translate?: boolean;
  readonly description?: string | null;
  readonly icon?: ArcTechIcon;
  /** In-app route; without one the item emits `itemSelected`. */
  readonly route?: string | null;
  readonly children?: readonly SecondarySidebarItem[];
}

/**
 * Sidebar of the full-page sheets: the Nordic Relic sidebar tabs — recessed panel, rows split by 1px lines, the
 * active row raised with a 3px bronze marker.
 * - `cascade` (contextual, Settings): branches carry the settings-style title (with its dot) and description.
 * - `groups` (tab-based, Templates): branches are light collapsible section headers with a count, open by default.
 * Below the two-column breakpoint it collapses into one bar showing the current item; clicking it expands the list
 * in place, choosing an item collapses it again.
 */
@Component({
  selector: 'app-secondary-sidebar',
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, ArcTechIconComponent],
  templateUrl: './secondary-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 flex-col overflow-y-auto border border-border bg-recessed lg:h-full',
  },
})
export class AppSecondarySidebarComponent {
  readonly items = input.required<readonly SecondarySidebarItem[]>();
  readonly activeKey = input<string | null>(null);
  readonly ariaLabel = input('');
  readonly variant = input<'cascade' | 'groups'>('cascade');
  /** i18n key shown before the current item in the narrow-screen bar (`SETTINGS · GENERAL.`). */
  readonly barTitle = input<string | null>(null);

  readonly itemSelected = output<SecondarySidebarItem>();

  private readonly translateService = inject(TranslateService);
  /** Branches toggled by the user: opened ones in `cascade`, closed ones in `groups` (open by default). */
  private readonly toggledKeys = signal<ReadonlySet<string>>(new Set());
  /** Narrow screens only: the list is shown under the bar. */
  protected readonly isBarOpen = signal(false);
  /** Label of the active item, for the narrow-screen bar. */
  protected readonly activeLabel = computed(() => {
    const key = this.activeKey();
    const item = this.items()
      .flatMap((entry) => [entry, ...(entry.children ?? [])])
      .find((entry) => entry.key === key);
    if (!item) {
      return '';
    }

    return item.translate === false ? item.label : this.translateService.instant(item.label);
  });
  /** Branch holding the active item: kept open so the active row is always visible. */
  private readonly activeBranchKey = computed(
    () =>
      this.items().find((item) => item.children?.some((child) => child.key === this.activeKey()))
        ?.key ?? null,
  );

  constructor() {
    effect(() => {
      const branchKey = this.activeBranchKey();
      if (branchKey) {
        untracked(() => this.setExpanded(branchKey, true));
      }
    });
  }

  protected isExpanded(item: SecondarySidebarItem): boolean {
    return this.toggledKeys().has(item.key) !== (this.variant() === 'groups');
  }

  protected toggle(item: SecondarySidebarItem): void {
    this.setExpanded(item.key, !this.isExpanded(item));
  }

  protected select(item: SecondarySidebarItem): void {
    this.isBarOpen.set(false);
    if (item.key !== this.activeKey()) {
      this.itemSelected.emit(item);
    }
  }

  private setExpanded(key: string, isExpanded: boolean): void {
    // In `groups` a key in the set means closed; in `cascade` it means open.
    const isInSet = isExpanded !== (this.variant() === 'groups');
    if (this.toggledKeys().has(key) === isInSet) {
      return;
    }

    this.toggledKeys.update((keys) => {
      const next = new Set(keys);
      if (isInSet) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }
}
