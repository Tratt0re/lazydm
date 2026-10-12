import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

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
 * Secondary sidebar of the full-page sheets (Settings, Compendium): the Nordic Relic sidebar tabs with
 * cascading branches — recessed panel, rows split by 1px lines, the active row raised with a 3px bronze
 * marker — carrying the settings-style title (with its dot) and description.
 */
@Component({
  selector: 'app-secondary-sidebar',
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, ArcTechIconComponent],
  templateUrl: './secondary-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 flex-col overflow-y-auto border border-border bg-recessed',
  },
})
export class AppSecondarySidebarComponent {
  readonly items = input.required<readonly SecondarySidebarItem[]>();
  readonly activeKey = input<string | null>(null);
  readonly ariaLabel = input('');

  readonly itemSelected = output<SecondarySidebarItem>();

  private readonly expandedKeys = signal<ReadonlySet<string>>(new Set());
  /** Branch holding the active item: kept open so the active row is always visible. */
  private readonly activeBranchKey = computed(
    () =>
      this.items().find((item) => item.children?.some((child) => child.key === this.activeKey()))
        ?.key ?? null,
  );

  constructor() {
    effect(() => {
      const branchKey = this.activeBranchKey();
      if (branchKey && !this.expandedKeys().has(branchKey)) {
        this.expandedKeys.update((keys) => new Set([...keys, branchKey]));
      }
    });
  }

  protected isExpanded(item: SecondarySidebarItem): boolean {
    return this.expandedKeys().has(item.key);
  }

  protected toggle(item: SecondarySidebarItem): void {
    this.expandedKeys.update((keys) => {
      const next = new Set(keys);
      if (next.has(item.key)) {
        next.delete(item.key);
      } else {
        next.add(item.key);
      }
      return next;
    });
  }

  protected select(item: SecondarySidebarItem): void {
    if (item.key !== this.activeKey()) {
      this.itemSelected.emit(item);
    }
  }
}
