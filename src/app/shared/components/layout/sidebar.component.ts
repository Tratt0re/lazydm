import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  type TemplateRef,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import {
  sidebarGroupLabelVariants,
  sidebarGroupVariants,
  sidebarTriggerVariants,
  sidebarVariants,
} from '@/shared/components/layout/layout.variants';
import { ArcTechStringTemplateOutletDirective } from '@/shared/core/directives/string-template-outlet/string-template-outlet.directive';
import { mergeClasses, transform } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-sidebar',
  imports: [ArcTechStringTemplateOutletDirective, ArcTechIconComponent],
  template: `
    <aside [class]="classes()" [style.width.px]="currentWidth()" [attr.data-collapsed]="arcCollapsed()">
      <div class="flex-1 overflow-auto">
        <ng-content />
      </div>

      @if (arcCollapsible() && !arcTrigger()) {
        <div
          [class]="triggerClasses()"
          (click)="toggleCollapsed()"
          (keydown.{enter,space}.prevent)="toggleCollapsed()"
          tabindex="0"
          role="button"
          [attr.aria-label]="arcCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          [attr.aria-expanded]="!arcCollapsed()"
        >
          <arc-icon [arcType]="chevronIcon()" />
        </div>
      }

      @if (arcCollapsible() && arcTrigger()) {
        <ng-container *arcStringTemplateOutlet="arcTrigger()" />
      }
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcSidebar',
})
export class SidebarComponent {
  readonly arcWidth = input<string | number>(200);
  readonly arcCollapsedWidth = input<number>(64);
  readonly arcCollapsible = input(false, { transform });
  readonly arcCollapsed = input(false, { transform });
  readonly arcReverseArrow = input(false, { transform });
  readonly arcTrigger = input<TemplateRef<void> | null>(null);
  readonly class = input<ClassValue>('');

  readonly arcCollapsedChange = output<boolean>();

  private readonly internalCollapsed = signal(false);

  constructor() {
    effect(() => {
      this.internalCollapsed.set(this.arcCollapsed());
    });
  }

  protected readonly currentWidth = computed(() => {
    const collapsed = this.arcCollapsed();
    if (collapsed) {
      return this.arcCollapsedWidth();
    }

    const width = this.arcWidth();
    return typeof width === 'number' ? width : parseInt(width, 10);
  });

  protected readonly chevronIcon = computed((): ArcTechIcon => {
    const collapsed = this.arcCollapsed();
    const reverse = this.arcReverseArrow();

    if (reverse) {
      return collapsed ? 'chevron-left' : 'chevron-right';
    }
    return collapsed ? 'chevron-right' : 'chevron-left';
  });

  protected readonly classes = computed(() => mergeClasses(sidebarVariants(), this.class()));

  protected readonly triggerClasses = computed(() => mergeClasses(sidebarTriggerVariants()));

  toggleCollapsed(): void {
    const newState = !this.arcCollapsed();
    this.internalCollapsed.set(newState);
    this.arcCollapsedChange.emit(newState);
  }
}

@Component({
  selector: 'arc-sidebar-group',
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcSidebarGroup',
})
export class SidebarGroupComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(sidebarGroupVariants(), this.class()));
}

@Component({
  selector: 'arc-sidebar-group-label',
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcSidebarGroupLabel',
})
export class SidebarGroupLabelComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(sidebarGroupLabelVariants(), this.class()));
}
