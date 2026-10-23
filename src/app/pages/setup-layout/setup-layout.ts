import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Frame of the first-run setup flow: the centred panel with its bronze corner brackets around the current step. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-setup-layout',
  imports: [RouterOutlet],
  template: `
    <main class="flex h-full items-center justify-center p-6">
      <section
        class="arc-setup-panel flex max-h-full w-full max-w-xl flex-col border border-border bg-card text-card-foreground"
      >
        <span class="arc-card-corner arc-card-corner-tl" aria-hidden="true"></span>
        <span class="arc-card-corner arc-card-corner-tr" aria-hidden="true"></span>
        <span class="arc-card-corner arc-card-corner-bl" aria-hidden="true"></span>
        <span class="arc-card-corner arc-card-corner-br" aria-hidden="true"></span>
        <router-outlet />
      </section>
    </main>
  `,
})
export class SetupLayout {}
