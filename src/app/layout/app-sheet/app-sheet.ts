import { Component, HostListener, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';

import { APP_SHEET_TITLE_ROUTE_DATA, AppSheetService } from '@/services/app-sheet.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';

/**
 * Full-page sheet (Compendium, Settings) over the current page, with the same header as the dialogs:
 * big condensed title, engraved divider, square close button. Its pages get their own toolbar context,
 * so they never change the toolbar (or the tab titles) of the campaign underneath.
 */
@Component({
  selector: 'app-sheet',
  imports: [RouterOutlet, TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent],
  providers: [ToolbarContextService],
  template: `
    <section
      class="app-sheet-enter flex h-full min-h-0 flex-col border-b-2 border-border-strong bg-background shadow-[0_12px_25px_#0005]"
      [class.app-sheet-leave]="sheets.isClosing()"
      role="region"
      aria-labelledby="app-sheet-title"
    >
      <header class="flex shrink-0 items-start justify-between gap-4 px-6 pt-5">
        <h1
          id="app-sheet-title"
          class="font-display text-[35px] leading-none font-extrabold tracking-[0.025em] text-foreground-strong uppercase"
        >
          {{ title() | translate }}<span class="text-primary" aria-hidden="true">.</span>
        </h1>
        <button
          type="button"
          arc-button
          arcType="ghost"
          arcSize="sm"
          class="border border-input"
          [attr.aria-label]="'common.close' | translate"
          (click)="sheets.close()"
        >
          <arc-icon arcType="x" />
        </button>
      </header>
      <div class="arc-engraved-divider mx-6 mt-2 shrink-0" aria-hidden="true"><span></span></div>

      <!-- Wide screens: the page scrolls its own columns, so a secondary sidebar stays in place. -->
      <div class="relative flex min-h-0 flex-1 flex-col overflow-auto lg:overflow-hidden">
        <router-outlet />
      </div>
    </section>
  `,
  host: {
    class: 'absolute inset-0 z-40 block',
  },
})
export class AppSheet {
  protected readonly sheets = inject(AppSheetService);
  protected readonly title = toSignal(
    inject(ActivatedRoute).data.pipe(map((data) => String(data[APP_SHEET_TITLE_ROUTE_DATA] ?? ''))),
    { initialValue: '' },
  );

  /** Escape closes the sheet, unless a menu, dialog or panel above it handles it first. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    const hasOpenOverlay = [
      ...document.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane'),
    ].some((pane) => pane.childElementCount > 0);
    if (!hasOpenOverlay) {
      void this.sheets.close();
    }
  }
}
