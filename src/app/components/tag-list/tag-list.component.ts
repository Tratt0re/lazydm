import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { splitTags, VISIBLE_TAGS } from '@/config/section-filter.config';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechPopoverDirective } from '@/shared/components/popover';

/**
 * The tags of a file as small square badges: a few, then a dashed `+N` that opens the full list. A tag is a
 * button; clicking it adds it to (or removes it from) the page filter. One look for every place that shows tags.
 */
@Component({
  selector: 'app-tag-list',
  imports: [NgTemplateOutlet, TranslatePipe, ArcTechIconComponent, ArcTechPopoverDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 items-center gap-1', '[class.flex-wrap]': 'wrap()' },
  template: `
    @for (tag of parts().visible; track tag) {
      <ng-container *ngTemplateOutlet="tagButton; context: { $implicit: tag }" />
    }

    @if (parts().hidden.length > 0) {
      <button
        type="button"
        arcPopover
        [arcContent]="allTags"
        arcPlacement="bottom"
        [arcVisible]="isOpen()"
        (arcVisibleChange)="isOpen.set($event)"
        class="inline-flex h-5 shrink-0 cursor-pointer items-center border border-dashed border-border-subtle px-1.5 font-mono text-[11px] text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        [attr.aria-label]="'campaigns.sections.tags.more' | translate: { count: parts().hidden.length }"
        [attr.aria-expanded]="isOpen()"
        (click)="$event.stopPropagation()"
      >
        +{{ parts().hidden.length }}
      </button>
    }

    <ng-template #tagButton let-tag>
      <button
        type="button"
        class="inline-flex h-5 max-w-[15ch] shrink-0 cursor-pointer items-center gap-1 border px-1.5 font-mono text-[11px] whitespace-nowrap hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        [class]="
          isActive(tag)
            ? 'border-primary bg-primary/10 font-medium text-primary'
            : 'border-border-subtle text-foreground-secondary'
        "
        [attr.aria-pressed]="isActive(tag)"
        [attr.title]="tag"
        (click)="onTag($event, tag)"
      >
        @if (isActive(tag)) {
          <arc-icon arcType="check" class="size-2.5 shrink-0" aria-hidden="true" />
        }
        <span class="truncate">{{ tag }}</span>
      </button>
    </ng-template>

    <ng-template #allTags>
      <div
        class="flex w-max max-w-72 flex-wrap gap-1 border border-border-strong bg-popover p-2 shadow-overlay"
        role="group"
        [attr.aria-label]="'campaigns.sections.tags.all' | translate"
      >
        @for (tag of tags(); track tag) {
          <ng-container *ngTemplateOutlet="tagButton; context: { $implicit: tag }" />
        }
      </div>
    </ng-template>
  `,
})
export class AppTagListComponent {
  readonly tags = input.required<readonly string[]>();
  /** Tags of the page filter: shown ticked, and first. */
  readonly active = input<readonly string[]>([]);
  /** The typed search text: tags that contain it come before the others. */
  readonly query = input('');
  readonly max = input(VISIBLE_TAGS);
  /** Let the badges wrap onto more lines (detail panels) instead of hiding the rest behind `+N`. */
  readonly wrap = input(false);
  readonly tagClicked = output<string>();

  protected readonly isOpen = signal(false);
  protected readonly parts = computed(() =>
    splitTags(
      this.tags(),
      this.active(),
      this.query(),
      this.wrap() ? Number.MAX_SAFE_INTEGER : this.max(),
    ),
  );

  protected isActive(tag: string): boolean {
    return this.active().includes(tag);
  }

  protected onTag(event: Event, tag: string): void {
    // The row or card behind is a link: a tag never opens it.
    event.stopPropagation();
    event.preventDefault();
    this.tagClicked.emit(tag);
  }
}
