import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly isWide = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // The panel is as tall as its step (the Codex step grows when a folder is checked): it eases between heights.
    afterNextRender(() => {
      const panel = this.host.nativeElement.querySelector<HTMLElement>('section');
      if (!panel || typeof ResizeObserver === 'undefined') {
        return;
      }

      let lastHeight = panel.offsetHeight;
      let animation: Animation | null = null;
      const observer = new ResizeObserver(() => {
        const height = panel.offsetHeight;
        // The animation itself resizes the panel: only a change while it rests starts a new one.
        if (animation || height === lastHeight) {
          return;
        }

        const from = lastHeight;
        lastHeight = height;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          return;
        }

        panel.style.overflow = 'hidden';
        const current = panel.animate([{ height: `${from}px` }, { height: `${height}px` }], {
          duration: 200,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        });
        animation = current;
        const done = () => {
          animation = null;
          panel.style.overflow = '';
          lastHeight = panel.offsetHeight;
        };
        current.onfinish = done;
        current.oncancel = done;
      });
      observer.observe(panel);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected updateWidth(): void {
    this.isWide.set(this.route.firstChild?.snapshot.data['setupWide'] === true);
  }
}
