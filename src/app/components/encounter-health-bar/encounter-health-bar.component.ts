import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Health bar of an entity: current HP over maximum HP, with temporary HP as a second segment. Everything is
 * optional: with no maximum only the numbers show, with no HP at all nothing does. The numbers are always
 * written, so the state never relies on colour alone.
 */
@Component({
  selector: 'app-encounter-health-bar',
  template: `
    @if (current() !== null || max() !== null) {
      <div class="flex w-full min-w-32 flex-col gap-1">
        <div class="flex items-baseline gap-2 font-mono text-xs font-semibold">
          <span>{{ current() ?? '–' }} / {{ max() ?? '–' }}</span>
          @if (temp() > 0) {
            <span class="text-info">+{{ temp() }}</span>
          }
        </div>
        @if (scale() > 0) {
          <div
            class="flex h-2 w-full border border-border bg-recessed"
            role="meter"
            [attr.aria-label]="label()"
            aria-valuemin="0"
            [attr.aria-valuemax]="scale()"
            [attr.aria-valuenow]="current() ?? 0"
          >
            <div [class]="fillClass()" [style.width.%]="currentPercent()"></div>
            <div class="bg-info" [style.width.%]="tempPercent()"></div>
          </div>
        }
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
  protected readonly fillClass = computed(() => {
    const ratio = (this.current() ?? 0) / (this.max() || 1);
    return ratio > 0.5 ? 'bg-success' : ratio > 0.25 ? 'bg-warning' : 'bg-destructive';
  });
}
