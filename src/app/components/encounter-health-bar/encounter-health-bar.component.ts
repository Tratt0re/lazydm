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
      <!-- Field instrument: label on the left, "+temp  hp / max" on the right, the meter under them. -->
      <div class="flex w-full min-w-40 flex-col gap-1">
        <div class="flex items-baseline justify-between gap-3">
          <span class="truncate font-mono text-[11px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">{{ label() }}</span>
          @if (editable()) {
            <span class="group flex shrink-0 items-center gap-1 font-bold" [class]="isLarge() ? 'font-display text-2xl leading-none' : 'font-mono text-xs'">
              <!-- Temporary HP are rare: the slot shows when there are some, or when the row is hovered or focused. -->
              <arc-inline-value
                arcType="number"
                [arcInputClass]="isLarge() ? 'h-8 w-14 px-1 text-center font-display text-xl' : 'h-6 w-12 px-1 text-center font-mono text-xs'"
                [class]="temp() > 0 ? '' : 'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'"
                [arcLabel]="tempLabel()"
                [arcValue]="temp() > 0 ? temp() : null"
                (arcCommit)="tempChange.emit($event)"
              >
                <span [class]="temp() > 0 ? 'text-info' : 'text-muted-foreground'">+{{ temp() > 0 ? temp() : 0 }}</span>
              </arc-inline-value>
              <arc-inline-value
                arcType="number"
                [arcInputClass]="isLarge() ? 'h-8 w-14 px-1 text-center font-display text-xl' : 'h-6 w-12 px-1 text-center font-mono text-xs'"
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
                [arcInputClass]="isLarge() ? 'h-8 w-14 px-1 text-center font-display text-xl' : 'h-6 w-12 px-1 text-center font-mono text-xs'"
                [arcLabel]="maxLabel()"
                [arcValue]="max()"
                (arcCommit)="maxChange.emit($event)"
              >
                <span>{{ max() ?? '–' }}</span>
              </arc-inline-value>
            </span>
          } @else {
            <strong class="shrink-0" [class]="isLarge() ? 'font-display text-2xl leading-none' : 'font-mono text-xs'">
              @if (temp() > 0) {
                <span class="mr-2 text-info">+{{ temp() }}</span>
              }{{ current() ?? '–' }} / {{ max() ?? '–' }}
            </strong>
          }
        </div>
        <div
          class="flex h-3 w-full overflow-hidden border border-border bg-recessed"
          role="meter"
          [attr.aria-label]="label()"
          aria-valuemin="0"
          [attr.aria-valuemax]="scale() > 0 ? scale() : null"
          [attr.aria-valuenow]="current() ?? 0"
          [attr.aria-valuetext]="valueText()"
        >
          @if (scale() > 0) {
            <div class="h-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none" [class]="fillClass()" [style.width.%]="currentPercent()"></div>
            <div class="h-full bg-info transition-[width] duration-500 ease-out motion-reduce:transition-none" [style.width.%]="tempPercent()"></div>
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
