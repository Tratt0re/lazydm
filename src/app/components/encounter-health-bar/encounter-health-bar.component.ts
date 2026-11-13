import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ArcTechInlineValueComponent, type ArcTechInlineValue } from '@/shared/components/inline-value';

/**
 * Health bar of an entity: current HP over maximum HP, with temporary HP as a second segment. Everything is
 * optional: with no maximum only the numbers show, with no HP at all nothing does. The numbers are always
 * written above the bar (label left, numbers right), so the state never relies on colour alone. The bar slides
 * when it goes down or up. When `editable`, each number is typed in place (current, maximum, temporary).
 */
@Component({
  selector: 'app-encounter-health-bar',
  imports: [ArcTechInlineValueComponent],
  template: `
    @if (current() !== null || max() !== null || editable()) {
      <!-- The numbers sit ON the bar (label at one end, temporary + current / max at the other); under it the
           projected content holds the quick HP controls. -->
      <div class="flex w-full min-w-40 flex-col gap-1">
        <div
          class="relative flex w-full items-center overflow-hidden border border-border bg-recessed"
          [class]="isLarge() ? 'h-9' : 'h-6'"
          role="meter"
          [attr.aria-label]="label()"
          aria-valuemin="0"
          [attr.aria-valuemax]="scale() > 0 ? scale() : null"
          [attr.aria-valuenow]="current() ?? 0"
          [attr.aria-valuetext]="valueText()"
        >
          @if (scale() > 0) {
            <div class="absolute inset-y-0 left-0 transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none" [class]="fillClass()" [style.width.%]="currentPercent()"></div>
            <div class="absolute inset-y-0 bg-info transition-[width,left] duration-500 ease-out motion-reduce:transition-none" [style.left.%]="currentPercent()" [style.width.%]="tempPercent()"></div>
          }
          <span class="relative z-1 ml-1 truncate bg-recessed px-1 font-mono text-[11px] font-semibold tracking-[0.11em] text-foreground-strong uppercase">{{ label() }}</span>
          @if (editable()) {
            <span
              class="group relative z-1 mr-1 ml-auto flex shrink-0 items-center gap-0.5 bg-recessed px-1 font-bold text-foreground-strong"
              [class]="isLarge() ? 'font-display text-2xl leading-none' : 'font-mono text-xs'"
            >
              <!-- Temporary HP are rare: the slot shows when there are some, or when the row is hovered or focused. -->
              <arc-inline-value
                arcType="number"
                [arcInputClass]="isLarge() ? 'h-7 w-14 px-1 text-center font-display text-xl' : 'h-5 w-11 px-1 text-center font-mono text-xs'"
                [class]="temp() > 0 ? '' : 'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'"
                [arcLabel]="tempLabel()"
                [arcValue]="temp() > 0 ? temp() : null"
                (arcCommit)="tempChange.emit($event)"
              >
                <span class="px-0.5" [class]="temp() > 0 ? 'bg-info text-primary-foreground' : 'text-muted-foreground'">+{{ temp() > 0 ? temp() : 0 }}</span>
              </arc-inline-value>
              <arc-inline-value
                arcType="number"
                [arcInputClass]="isLarge() ? 'h-7 w-14 px-1 text-center font-display text-xl' : 'h-5 w-11 px-1 text-center font-mono text-xs'"
                [arcLabel]="currentLabel()"
                [arcValue]="current()"
                [arcOverridden]="overridden()"
                [arcOverriddenLabel]="overriddenLabel()"
                (arcCommit)="currentChange.emit($event)"
              >
                <span>{{ current() ?? '–' }}</span>
              </arc-inline-value>
              <span aria-hidden="true">/</span>
              <arc-inline-value
                arcType="number"
                [arcInputClass]="isLarge() ? 'h-7 w-14 px-1 text-center font-display text-xl' : 'h-5 w-11 px-1 text-center font-mono text-xs'"
                [arcLabel]="maxLabel()"
                [arcValue]="max()"
                (arcCommit)="maxChange.emit($event)"
              >
                <span>{{ max() ?? '–' }}</span>
              </arc-inline-value>
            </span>
          } @else {
            <strong class="relative z-1 mr-1 ml-auto shrink-0 bg-recessed px-1 text-foreground-strong" [class]="isLarge() ? 'font-display text-2xl leading-none' : 'font-mono text-xs'">
              @if (temp() > 0) {
                <span class="mr-2">+{{ temp() }}</span>
              }{{ current() ?? '–' }} / {{ max() ?? '–' }}
            </strong>
          }
        </div>
        <ng-content />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppEncounterHealthBarComponent {
  readonly current = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly temp = input(0);
  readonly label = input('');
  /** The current / max figure is set in the display face, for the Expanded row. */
  readonly isLarge = input(false);
  /** The numbers are typed in place; each commit says its new value (null: emptied). */
  readonly editable = input(false);
  /** The entity's own numbers differ from its note's: a mark on the current HP. */
  readonly overridden = input(false);
  readonly overriddenLabel = input('');
  readonly currentLabel = input('');
  readonly maxLabel = input('');
  readonly tempLabel = input('');
  readonly currentChange = output<ArcTechInlineValue>();
  readonly maxChange = output<ArcTechInlineValue>();
  readonly tempChange = output<ArcTechInlineValue>();

  /** What the full bar stands for: the maximum, or more when current + temporary HP go past it. */
  protected readonly scale = computed(() => {
    const max = this.max();
    return max !== null && max > 0 ? Math.max(max, (this.current() ?? 0) + this.temp()) : 0;
  });
  protected readonly currentPercent = computed(
    () => (Math.max(this.current() ?? 0, 0) / this.scale()) * 100,
  );
  protected readonly tempPercent = computed(
    () => (Math.max(this.temp(), 0) / this.scale()) * 100,
  );
  protected readonly valueText = computed(
    () => `${this.current() ?? '–'} / ${this.max() ?? '–'}${this.temp() > 0 ? ` +${this.temp()}` : ''}`,
  );
  protected readonly fillClass = computed(() => {
    const ratio = (this.current() ?? 0) / (this.max() || 1);
    return ratio > 0.5 ? 'bg-success' : ratio > 0.25 ? 'bg-warning' : 'bg-destructive';
  });
}
