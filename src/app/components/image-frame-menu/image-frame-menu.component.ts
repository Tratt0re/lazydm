import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';

import {
  IMAGE_WIDTHS,
  type ImageFrame,
  type ImageWidth,
  NO_IMAGE_FRAME,
} from '@/components/code-editor/image-frame';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

const WIDTH_ICONS: Readonly<Record<ImageWidth, ArcTechIcon>> = {
  half: 'rectangle-horizontal',
  wide: 'maximize-2',
  full: 'maximize',
};

/**
 * The "…" menu of an image embed in the live preview: its width, written into the embed
 * (`![[img.png|wide]]`). Choosing the checked entry again clears it; Reset clears it too.
 */
@Component({
  selector: 'app-image-frame-menu',
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechMenuImports],
  template: `
    <span
      class="hidden"
      arc-context-menu
      [arcContextMenuTriggerFor]="frameMenu"
      aria-hidden="true"
    ></span>

    <ng-template #frameMenu>
      <div arc-menu-content class="w-52">
        <div arc-menu-label>{{ 'document.imageFrame.width' | translate }}</div>
        @for (width of widths; track width) {
          <button
            type="button"
            arc-menu-item
            (click)="choose({ width: width === frame().width ? null : width })"
          >
            <arc-icon [arcType]="widthIcons[width]" />
            {{ 'document.imageFrame.widths.' + width | translate }}
            @if (width === frame().width) {
              <arc-icon arcType="check" class="ml-auto" />
            }
          </button>
        }
        <div class="-mx-1 my-1 h-px bg-border-subtle" role="separator"></div>
        <button type="button" arc-menu-item (click)="reset()">
          <arc-icon arcType="rotate-ccw" />
          {{ 'document.imageFrame.reset' | translate }}
        </button>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppImageFrameMenuComponent {
  private readonly trigger = viewChild.required(CdkContextMenuTrigger);

  /** The frame of the image the menu was opened for (its checked entries). */
  protected readonly frame = signal<ImageFrame>(NO_IMAGE_FRAME);
  protected readonly widths = IMAGE_WIDTHS;
  protected readonly widthIcons = WIDTH_ICONS;

  /** The new frame, built from the one the menu was opened with. */
  readonly frameChange = output<ImageFrame>();
  /** The menu closed, with or without a choice: the editor takes the focus back. */
  readonly menuClosed = output<void>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() =>
      this.trigger()
        .closed.pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => this.menuClosed.emit()),
    );
  }

  /** Opens the menu at a screen position, showing the image's current frame. */
  open(x: number, y: number, frame: ImageFrame): void {
    this.frame.set(frame);
    const trigger = this.trigger();
    trigger.close();
    trigger.open({ x, y });
  }

  protected choose(change: Partial<ImageFrame>): void {
    this.frameChange.emit({ ...this.frame(), ...change });
  }

  protected reset(): void {
    this.frameChange.emit(NO_IMAGE_FRAME);
  }
}
