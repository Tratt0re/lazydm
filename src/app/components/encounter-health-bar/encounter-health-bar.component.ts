import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Health bar of an entity: current HP over maximum HP, with temporary HP as a second segment. Everything is
 * optional: with no maximum only the numbers show, with no HP at all nothing does. The numbers are always
 * written above the bar (label left, numbers right), so the state never relies on colour alone. The bar slides
 * when it goes down or up.
 */
@Component({
  selector: 'app-encounter-health-bar',
  template: `
    @if (current() !== null || max() !== null) {
      <!-- Field instrument: label on the left, "+temp  hp / max" on the right, the meter under them. -->
      <div class="flex w-full min-w-40 flex-col gap-1">
        <div class="flex items-baseline justify-between gap-3">
          <span class="truncate font-mono text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">{{ label() }}</span>
          <strong class="shrink-0 font-mono text-xs">
            @if (temp() > 0) {
              <span class="mr-2 text-info">+{{ temp() }}</span>
            }{{ current() ?? '–' }} / {{ max() ?? '–' }}
          </strong>
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
