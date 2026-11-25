import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import {
  SIDE_PANEL_DEFAULT_REM,
  SIDE_PANEL_OVER_GAP_REM,
  SIDE_PANEL_OVER_MAX_REM,
  sidePanelMode,
  type SidePanelMode,
} from '@/config/side-panel.config';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';

/**
 * A panel on the right of a page: *beside* the content when the pane has the room (it slides in and takes its width),
 * *over* the content when it does not (a sheet on the right edge, a scrim on the rest, Escape and a click on the scrim
 * close it). The pane is the parent element, which must be `relative`: it is measured, not the window, because a pane is
 * narrower than the window when the sidebar is open or the screen is split.
 *
 * Put the panel next to the content, inside one `relative flex` row. `(modeChange)` fires when the mode is first known
 * and whenever it changes, so a page can close a panel that would suddenly cover its content.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'arc-side-panel',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent],
  host: {
    role: 'complementary',
    '[class]': 'hostClass()',
    '[style.width.rem]': "mode() === 'beside' ? (arcOpen() ? arcWidth() : 0) : null",
    '[attr.aria-label]': 'arcLabel() || null',
    '[attr.aria-hidden]': "arcOpen() ? null : 'true'",
    '[attr.inert]': "arcOpen() ? null : ''",
    '[attr.data-mode]': 'mode()',
  },
  template: `
    @if (mode() === 'over') {
      <div
        class="absolute inset-0 bg-scrim/50 transition-opacity duration-200 motion-reduce:transition-none"
        [class]="arcOpen() ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
        aria-hidden="true"
        (click)="closed.emit()"
      ></div>
    }
    <div
      #panel
      tabindex="-1"
      [class]="panelClass()"
      [style.width]="mode() === 'beside' ? arcWidth() + 'rem' : overWidth"
    >
      @if (arcTitle()) {
        <div
          class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border pr-2 pl-4"
        >
          <h2
            class="font-mono text-[11px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
          >
            {{ arcTitle() }}
          </h2>
          <button
            type="button"
            arc-button
            arcType="ghost"
            arcSize="sm"
            [attr.aria-label]="'common.close' | translate"
            (click)="closed.emit()"
          >
            <arc-icon arcType="x" />
          </button>
        </div>
      }
      <ng-content />
    </div>
  `,
})
export class ArcTechSidePanelComponent {
  /** Whether the panel is shown. The page owns it; the panel asks to close with `(closed)`. */
  readonly arcOpen = input.required<boolean>();
  /** Accessible name of the panel. */
  readonly arcLabel = input<string>('');
  /** A header with this title and a close button; leave it out when the content brings its own header. */
  readonly arcTitle = input<string>('');
  /** Width beside the content, in rem. */
  readonly arcWidth = input<number>(SIDE_PANEL_DEFAULT_REM);

  /** Escape, a click on the scrim or the header's close button. */
  readonly closed = output<void>();
  /** The mode, as soon as it is known and every time it changes. */
  readonly modeChange = output<SidePanelMode>();

  protected readonly overWidth = `min(${SIDE_PANEL_OVER_MAX_REM}rem, calc(100% - ${SIDE_PANEL_OVER_GAP_REM}rem))`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly paneWidth = signal<number | null>(null);
  private returnFocusTo: HTMLElement | null = null;

  /** Beside until the pane has been measured: a closed panel takes no room, so nothing flashes. */
  readonly mode = computed<SidePanelMode>(() => {
    const width = this.paneWidth();
    return width === null ? 'beside' : sidePanelMode(width, this.arcWidth(), this.remPx());
  });

  protected readonly hostClass = computed(() =>
    this.mode() === 'beside'
      ? 'relative flex shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none ' +
        (this.arcOpen() ? 'opacity-100' : 'opacity-0')
      : 'pointer-events-none absolute inset-0 z-30 flex overflow-hidden',
  );
  protected readonly panelClass = computed(() => {
    const base = 'flex h-full min-h-0 flex-col border-l border-border bg-card outline-none';
    if (this.mode() === 'beside') {
      return `${base} shrink-0`;
    }

    return (
      `${base} pointer-events-auto relative ml-auto transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ` +
      (this.arcOpen() ? 'translate-x-0 shadow-overlay' : 'translate-x-full')
    );
  });

  constructor() {
    afterNextRender(() => {
      const pane = this.host.nativeElement.parentElement;
      if (!pane) {
        return;
      }

      this.paneWidth.set(pane.clientWidth);
      const observer = new ResizeObserver(() => this.paneWidth.set(pane.clientWidth));
      observer.observe(pane);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    let lastMode: SidePanelMode | null = null;
    effect(() => {
      const mode = this.mode();
      if (this.paneWidth() !== null && mode !== lastMode) {
        lastMode = mode;
        untracked(() => this.modeChange.emit(mode));
      }
    });

    // Over the content, an opening panel takes the focus and gives it back on closing.
    effect(() => {
      const isOver = this.mode() === 'over';
      const isOpen = this.arcOpen();
      untracked(() => {
        if (isOver && isOpen) {
          this.returnFocusTo =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          queueMicrotask(() => this.panel().nativeElement.focus({ preventScroll: true }));
        } else if (this.returnFocusTo) {
          const target = this.returnFocusTo;
          this.returnFocusTo = null;
          if (target.isConnected) {
            target.focus({ preventScroll: true });
          }
        }
      });
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    // A menu or a dialog that is open takes the Escape first.
    if (
      this.mode() !== 'over' ||
      !this.arcOpen() ||
      event.defaultPrevented ||
      document.querySelector(
        '.cdk-overlay-pane [arc-menu-content], .cdk-overlay-pane [role="dialog"]',
      )
    ) {
      return;
    }

    // The key is used: the sheet or page under the panel must not close with it.
    event.preventDefault();
    this.closed.emit();
  }

  private remPx(): number {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }
}
