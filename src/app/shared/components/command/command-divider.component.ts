import { ChangeDetectionStrategy, Component, computed, inject, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { ArcTechCommandComponent } from '@/shared/components/command/command.component';
import { commandSeparatorVariants } from '@/shared/components/command/command.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-command-divider',
  template: `
    @if (shouldShow()) {
      <div [class]="classes()" role="separator"></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcCommandDivider',
})
export class ArcTechCommandDividerComponent {
  private readonly commandComponent = inject(ArcTechCommandComponent, { optional: true });

  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(commandSeparatorVariants(), this.class()));

  protected readonly shouldShow = computed(() => {
    if (!this.commandComponent) {
      return true;
    }

    const searchTerm = this.commandComponent.searchTerm();

    // If no search, always show dividers
    if (searchTerm === '') {
      return true;
    }

    // If there's a search term, hide all dividers for now
    // This is a simple approach - we can make it smarter later
    return false;
  });
}
