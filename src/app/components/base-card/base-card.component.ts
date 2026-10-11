import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type TemplateRef,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import {
  baseCardBodyVariants,
  baseCardFooterVariants,
  baseCardHeaderVariants,
  baseCardTitleVariants,
  baseCardVariants,
} from './base-card.variants';
import { ArcTechIdDirective, ArcTechStringTemplateOutletDirective } from '@/shared/core';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'app-base-card',
  imports: [ArcTechStringTemplateOutletDirective, ArcTechIdDirective],
  templateUrl: './base-card.component.html',
  styles: `
    [data-slot='card-footer']:empty {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'card',
    '[class]': 'classes()',
    '[attr.aria-labelledby]': 'titleId()',
    '[attr.aria-describedby]': 'descriptionId()',
  },
  exportAs: 'appBaseCard',
})
export class AppBaseCardComponent {
  private readonly generatedId = viewChild<ArcTechIdDirective>('z');

  readonly class = input<ClassValue>('');
  readonly arcFooterBorder = input(false, { transform: booleanAttribute });
  readonly arcHeaderBorder = input(false, { transform: booleanAttribute });
  readonly arcHeaderVariant = input<'default' | 'segmented'>('default');
  readonly arcBodyFill = input(false, { transform: booleanAttribute });
  readonly arcDescription = input<string | TemplateRef<void>>();
  readonly arcTitle = input<string | TemplateRef<void>>();

  protected readonly titleId = computed(() => {
    const baseId = this.generatedId()?.id();
    return this.arcTitle() && baseId ? `${baseId}-title` : null;
  });

  protected readonly descriptionId = computed(() => {
    const baseId = this.generatedId()?.id();
    return this.arcDescription() && baseId ? `${baseId}-description` : null;
  });

  protected readonly classes = computed(() => mergeClasses(baseCardVariants(), this.class()));
  protected readonly bodyClasses = computed(() =>
    mergeClasses(baseCardBodyVariants(), this.arcBodyFill() ? 'flex-1 min-h-0' : ''),
  );
  protected readonly footerClasses = computed(() =>
    mergeClasses(baseCardFooterVariants(), this.arcFooterBorder() ? 'border-t' : ''),
  );
  protected readonly headerClasses = computed(() =>
    mergeClasses(baseCardHeaderVariants({ variant: this.arcHeaderVariant() }), this.arcHeaderBorder() ? 'border-b' : ''),
  );
  protected readonly titleClasses = computed(() =>
    mergeClasses(baseCardTitleVariants({ variant: this.arcHeaderVariant() })),
  );
}
