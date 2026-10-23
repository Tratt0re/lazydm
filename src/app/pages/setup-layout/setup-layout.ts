import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';

/**
 * Frame of the first-run setup flow: the centred panel with its bronze corner brackets around the current
 * step. A step whose route has `data: { setupWide: true }` gets the wide panel.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-setup-layout',
  imports: [RouterOutlet],
  template: `
    <main class="flex h-full items-center justify-center p-6">
      <section
        class="arc-setup-panel flex max-h-full w-full flex-col border border-border bg-card text-card-foreground"
        [class.max-w-xl]="!isWide()"
        [class.max-w-6xl]="isWide()"
      >
        <span class="arc-card-corner arc-card-corner-tl" aria-hidden="true"></span>
        <span class="arc-card-corner arc-card-corner-tr" aria-hidden="true"></span>
        <span class="arc-card-corner arc-card-corner-bl" aria-hidden="true"></span>
        <span class="arc-card-corner arc-card-corner-br" aria-hidden="true"></span>
        <router-outlet (activate)="updateWidth()" />
      </section>
    </main>
  `,
})
export class SetupLayout {
  private readonly route = inject(ActivatedRoute);

  protected readonly isWide = signal(false);

  protected updateWidth(): void {
    this.isWide.set(this.route.firstChild?.snapshot.data['setupWide'] === true);
  }
}
