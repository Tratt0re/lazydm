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

import type { TableMenuAction } from '@/components/code-editor/table-widget';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

/** What the menu may do for the cell it was opened on (the header row cannot be deleted or inserted above). */
export interface TableMenuState {
  readonly canInsertAbove: boolean;
  readonly canDeleteRow: boolean;
  readonly canDeleteColumn: boolean;
}

/**
 * The menu of a cell of a table in the live preview: insert a row above or below, a column left or right, and
 * delete the cell's row or column (a table has no single cell to remove: its grid would break). Delete is
 * last, after a separator.
 */
@Component({
  selector: 'app-table-menu',
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechMenuImports],
  template: `
    <span
      class="hidden"
      arc-context-menu
      [arcContextMenuTriggerFor]="tableMenu"
      aria-hidden="true"
    ></span>

    <ng-template #tableMenu>
      <div arc-menu-content class="w-56">
        <button
          type="button"
          arc-menu-item
          [arcDisabled]="!state().canInsertAbove"
          (click)="run('rowAbove')"
        >
          <arc-icon arcType="arrow-up" />
          {{ 'document.table.rowAbove' | translate }}
        </button>
        <button type="button" arc-menu-item (click)="run('rowBelow')">
          <arc-icon arcType="arrow-down" />
          {{ 'document.table.rowBelow' | translate }}
        </button>
        <button type="button" arc-menu-item (click)="run('columnLeft')">
          <arc-icon arcType="arrow-left" />
          {{ 'document.table.columnLeft' | translate }}
        </button>
        <button type="button" arc-menu-item (click)="run('columnRight')">
          <arc-icon arcType="arrow-right" />
          {{ 'document.table.columnRight' | translate }}
        </button>
        <div class="-mx-1 my-1 h-px bg-border-subtle" role="separator"></div>
        <button
          type="button"
          arc-menu-item
          [arcDisabled]="!state().canDeleteRow"
          (click)="run('deleteRow')"
        >
          <arc-icon arcType="trash" />
          {{ 'document.table.deleteRow' | translate }}
        </button>
        <button
          type="button"
          arc-menu-item
          [arcDisabled]="!state().canDeleteColumn"
          (click)="run('deleteColumn')"
        >
          <arc-icon arcType="trash" />
          {{ 'document.table.deleteColumn' | translate }}
        </button>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppTableMenuComponent {
  private readonly trigger = viewChild.required(CdkContextMenuTrigger);

  protected readonly state = signal<TableMenuState>({
    canInsertAbove: true,
    canDeleteRow: true,
    canDeleteColumn: true,
  });

  /** An entry was chosen. */
  readonly action = output<TableMenuAction>();
  /** The menu closed, with or without a choice. */
  readonly menuClosed = output<void>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() =>
      this.trigger()
        .closed.pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => this.menuClosed.emit()),
    );

    // Releasing the right button fires an auxclick that the overlay would read as a click outside the menu
    // just opened (its trigger is a hidden element), closing it right away (as in the insert menu).
    document.addEventListener('auxclick', this.handleAuxClick, true);
    destroyRef.onDestroy(() => document.removeEventListener('auxclick', this.handleAuxClick, true));
  }

  private readonly handleAuxClick = (event: MouseEvent) => {
    if (event.button === 2 && this.trigger().isOpen()) {
      event.stopPropagation();
    }
  };

  /** Opens the menu at a screen position. */
  open(x: number, y: number, state: TableMenuState): void {
    this.state.set(state);
    const trigger = this.trigger();
    trigger.close();
    trigger.open({ x, y });
  }

  protected run(action: TableMenuAction): void {
    this.action.emit(action);
  }
}
