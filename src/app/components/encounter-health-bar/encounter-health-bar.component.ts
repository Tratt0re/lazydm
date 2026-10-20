import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Health bar of an entity: current HP over maximum HP, with temporary HP as a second segment. Everything is
 * optional: with no maximum only the numbers show, with no HP at all nothing does. The numbers are always
 * written over the bar, so the state never relies on colour alone.
 */
@Component({
  selector: 'app-encounter-health-bar',
  template: `
    @if (current() !== null || max() !== null) {
      <!-- The bar is one block; the numbers are written over it, on a backing so they read on any fill. -->
      <div
        class="relative flex h-6 w-full min-w-32 overflow-hidden border border-border bg-recessed"
        role="meter"
        [attr.aria-label]="label()"
        aria-valuemin="0"
        [attr.aria-valuemax]="scale() > 0 ? scale() : null"
        [attr.aria-valuenow]="current() ?? 0"
        [attr.aria-valuetext]="valueText()"
      >
        @if (scale() > 0) {
          <div [class]="fillClass()" [style.width.%]="currentPercent()"></div>
          <div class="bg-info" [style.width.%]="tempPercent()"></div>
        }
        <span
          class="absolute inset-0 flex items-center justify-center gap-2 font-mono text-xs font-semibold text-foreground-strong [text-shadow:0_0_3px_var(--card),0_0_3px_var(--card)]"
        >
          {{ current() ?? '–' }} / {{ max() ?? '–' }}
          @if (temp() > 0) {
            <span>+{{ temp() }}</span>
          }
        </span>
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
