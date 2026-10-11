import { NgTemplateOutlet } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { ClassValue } from 'clsx';

import {
  ArcTechButtonComponent,
  type ArcTechButtonSizeVariants,
  type ArcTechButtonTypeVariants,
} from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import {
  paginationContentVariants,
  paginationEllipsisVariants,
  paginationNextVariants,
  paginationPreviousVariants,
  paginationVariants,
} from '@/shared/components/pagination/pagination.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'ul[arc-pagination-content]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'pagination-content',
    '[class]': 'classes()',
  },
  exportAs: 'arcPaginationContent',
})
export class ArcTechPaginationContentComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(paginationContentVariants(), this.class()));
}

@Component({
  selector: 'li[arc-pagination-item]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'pagination-item',
  },
  exportAs: 'arcPaginationItem',
})
export class ArcTechPaginationItemComponent {}
// Structural wrapper component for pagination items (<li>). No inputs required.

@Component({
  selector: 'button[arc-pagination-button], a[arc-pagination-button]',
  imports: [ArcTechButtonComponent],
  template: `
    <arc-button
      [attr.data-active]="arcActive() || null"
      [class]="class()"
      [arcDisabled]="arcDisabled()"
      [arcSize]="arcSize()"
      [arcType]="arcButtonType()"
    >
      <ng-content />
    </arc-button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'pagination-button',
  },
  exportAs: 'arcPaginationButton',
})
export class ArcTechPaginationButtonComponent {
  readonly class = input<ClassValue>('');
  readonly arcActive = input(false, { transform: booleanAttribute });
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');
  readonly arcType = input<ArcTechButtonTypeVariants | null>(null);

  protected readonly arcButtonType = computed<ArcTechButtonTypeVariants>(() =>
    this.arcType() ?? (this.arcActive() ? 'outline' : 'ghost'),
  );
}

@Component({
  selector: 'arc-pagination-previous',
  imports: [TranslatePipe, ArcTechPaginationButtonComponent, ArcTechIconComponent, ...ArcTechTooltipImports],
  template: `
    <button
      type="button"
      arc-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.previousPage' | translate"
      [attr.disabled]="arcDisabled() ? '' : null"
      [arcTooltip]="'common.pagination.tooltips.previousPage' | translate"
      [arcType]="'secondary'"
      [class]="classes()"
      [arcSize]="arcSize()"
      [arcDisabled]="arcDisabled()"
    >
      <arc-icon arcType="chevron-left" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcPaginationPrevious',
})
export class ArcTechPaginationPreviousComponent {
  readonly class = input<ClassValue>('');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses(paginationPreviousVariants(), this.class()));
}

@Component({
  selector: 'arc-pagination-next',
  imports: [TranslatePipe, ArcTechPaginationButtonComponent, ArcTechIconComponent, ...ArcTechTooltipImports],
  template: `
    <button
      type="button"
      arc-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.nextPage' | translate"
      [attr.disabled]="arcDisabled() ? '' : null"
      [arcTooltip]="'common.pagination.tooltips.nextPage' | translate"
      [arcType]="'secondary'"
      [class]="classes()"
      [arcDisabled]="arcDisabled()"
      [arcSize]="arcSize()"
    >
      <arc-icon arcType="chevron-right" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcPaginationNext',
})
export class ArcTechPaginationNextComponent {
  readonly class = input<ClassValue>('');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses(paginationNextVariants(), this.class()));
}

@Component({
  selector: 'arc-pagination-first',
  imports: [TranslatePipe, ArcTechPaginationButtonComponent, ArcTechIconComponent, ...ArcTechTooltipImports],
  template: `
    <button
      type="button"
      arc-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.firstPage' | translate"
      [attr.disabled]="arcDisabled() ? '' : null"
      [arcTooltip]="'common.pagination.tooltips.firstPage' | translate"
      [arcType]="'secondary'"
      [class]="classes()"
      [arcDisabled]="arcDisabled()"
      [arcSize]="arcSize()"
    >
      <arc-icon arcType="chevrons-left" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcPaginationFirst',
})
export class ArcTechPaginationFirstComponent {
  readonly class = input<ClassValue>('');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses('size-9 p-0', this.class()));
}

@Component({
  selector: 'arc-pagination-last',
  imports: [TranslatePipe, ArcTechPaginationButtonComponent, ArcTechIconComponent, ...ArcTechTooltipImports],
  template: `
    <button
      type="button"
      arc-pagination-button
      [attr.aria-label]="'common.pagination.tooltips.lastPage' | translate"
      [attr.disabled]="arcDisabled() ? '' : null"
      [arcTooltip]="'common.pagination.tooltips.lastPage' | translate"
      [arcType]="'secondary'"
      [class]="classes()"
      [arcDisabled]="arcDisabled()"
      [arcSize]="arcSize()"
    >
      <arc-icon arcType="chevrons-right" aria-hidden="true" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcPaginationLast',
})
export class ArcTechPaginationLastComponent {
  readonly class = input<ClassValue>('');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');

  protected readonly classes = computed(() => mergeClasses('size-9 p-0', this.class()));
}

@Component({
  selector: 'arc-pagination-ellipsis',
  imports: [ArcTechIconComponent],
  template: `
    <arc-icon arcType="ellipsis" aria-hidden="true" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    'aria-hidden': 'true',
  },
  exportAs: 'arcPaginationEllipsis',
})
export class ArcTechPaginationEllipsisComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(paginationEllipsisVariants(), this.class()));
}

@Component({
  selector: 'arc-pagination',
  imports: [
    TranslatePipe,
    ArcTechPaginationContentComponent,
    ArcTechPaginationItemComponent,
    ArcTechPaginationButtonComponent,
    ArcTechPaginationFirstComponent,
    ArcTechPaginationPreviousComponent,
    ArcTechPaginationNextComponent,
    ArcTechPaginationLastComponent,
    NgTemplateOutlet,
  ],
  template: `
    @if (arcContent()) {
      <ng-container *ngTemplateOutlet="arcContent()" />
    } @else {
      <ul arc-pagination-content>
        <li arc-pagination-item>
          <arc-pagination-first
            [arcSize]="arcSize()"
            [arcDisabled]="arcDisabled() || arcPageIndex() === 1"
            (click)="goToPage(1)"
          />
        </li>

        <li arc-pagination-item>
          @let pagePrevious = Math.max(1, arcPageIndex() - 1);
          <arc-pagination-previous
            [arcSize]="arcSize()"
            [arcDisabled]="arcDisabled() || arcPageIndex() === 1"
            (click)="goToPage(pagePrevious)"
          />
        </li>

        @for (page of pages(); track page) {
          <li arc-pagination-item>
            <button
              arc-pagination-button
              type="button"
              class="focus-visible:rounded-md"
              [attr.aria-current]="page === arcPageIndex() ? 'page' : null"
              [attr.aria-disabled]="arcDisabled() || null"
              [arcActive]="page === arcPageIndex()"
              [arcDisabled]="arcDisabled()"
              [arcSize]="arcSize()"
              (click)="goToPage(page)"
            >
              <span class="sr-only">
                {{
                  page === arcTotal()
                    ? ('common.pagination.tooltips.toLastPage' | translate)
                    : ('common.pagination.tooltips.toPage' | translate)
                }}
              </span>
              {{ page }}
            </button>
          </li>
        }

        <li arc-pagination-item>
          @let pageNext = Math.min(arcPageIndex() + 1, arcTotal());
          <arc-pagination-next
            [arcSize]="arcSize()"
            [arcDisabled]="arcDisabled() || arcPageIndex() === arcTotal()"
            (click)="goToPage(pageNext)"
          />
        </li>

        <li arc-pagination-item>
          <arc-pagination-last
            [arcSize]="arcSize()"
            [arcDisabled]="arcDisabled() || arcPageIndex() === arcTotal()"
            (click)="goToPage(arcTotal())"
          />
        </li>
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    role: 'group',
    '[attr.aria-label]': 'arcAriaLabel()',
    'data-slot': 'pagination',
    '[class]': 'classes()',
  },
  exportAs: 'arcPagination',
})
export class ArcTechPaginationComponent {
  readonly arcPageIndex = model<number>(1);
  readonly arcTotal = input<number>(1);
  readonly arcVisiblePages = input<number>(5);
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcContent = input<TemplateRef<void> | undefined>();
  readonly arcAriaLabel = input('Pagination');

  readonly class = input<ClassValue>('');

  readonly arcPageIndexChange = output<number>();
  readonly Math = Math;

  protected readonly classes = computed(() => mergeClasses(paginationVariants(), this.class()));
  readonly pages = computed<number[]>(() => {
    const total = Math.max(1, Math.trunc(this.arcTotal()));
    const visiblePages = Math.max(1, Math.trunc(this.arcVisiblePages()));
    const current = this.clampPage(this.arcPageIndex());

    if (total <= visiblePages) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const halfWindow = Math.floor(visiblePages / 2);
    let start = Math.max(1, current - halfWindow);
    let end = start + visiblePages - 1;

    if (end > total) {
      end = total;
      start = Math.max(1, end - visiblePages + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  private clampPage(page: number): number {
    const total = Math.max(1, Math.trunc(this.arcTotal()));
    const normalizedPage = Math.trunc(page);
    if (!Number.isFinite(normalizedPage)) {
      return 1;
    }

    return Math.min(Math.max(1, normalizedPage), total);
  }

  goToPage(page: number): void {
    const nextPage = this.clampPage(page);
    if (!this.arcDisabled() && nextPage !== this.arcPageIndex()) {
      this.arcPageIndex.set(nextPage);
      this.arcPageIndexChange.emit(nextPage);
    }
  }
}
