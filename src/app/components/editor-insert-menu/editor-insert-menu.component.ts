import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';

import type { EditorInsertAction } from '@/components/code-editor/editor-commands';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

/** One entry of the menu: what it runs, its i18n label (`document.insertMenu.<action>`), icon and shortcut. */
interface InsertMenuItem {
  readonly action: EditorInsertAction;
  readonly label: string;
  readonly icon: ArcTechIcon;
  readonly shortcut?: string;
}

type InsertSubmenu = 'heading' | 'list' | 'callout' | 'asset';

/** An entry opening a submenu. */
interface InsertMenuSubmenu {
  readonly submenu: InsertSubmenu;
  readonly label: string;
  readonly icon: ArcTechIcon;
}

const SEPARATOR = 'separator';
type InsertMenuEntry = InsertMenuItem | InsertMenuSubmenu | typeof SEPARATOR;

/** Entries that only make sense with files to link to (hidden in templates). */
const LINK_ONLY_ACTIONS: readonly EditorInsertAction[] = ['link', 'asset'];

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

const submenu = (key: InsertSubmenu, label: string, icon: ArcTechIcon): InsertMenuSubmenu => ({
  submenu: key,
  label: `document.insertMenu.${label}`,
  icon,
});

const item = (
  action: EditorInsertAction,
  icon: ArcTechIcon,
  shortcut?: string,
): InsertMenuItem => ({
  action,
  label: `document.insertMenu.${action}`,
  icon,
  shortcut,
});

/** Right-click menu of the editor (Live and Source): clipboard, formatting and everything it can insert. */
@Component({
  selector: 'app-editor-insert-menu',
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechMenuImports],
  template: `
    <span
      class="hidden"
      arc-context-menu
      [arcContextMenuTriggerFor]="insertMenu"
      aria-hidden="true"
    ></span>

    <!-- Items are written inside each menu template: a menu item needs the menu it is declared in. -->
    <ng-template #insertMenu>
      <div arc-menu-content class="w-60">
        @for (entry of visibleEntries(); track $index) {
          @if (entry === SEPARATOR) {
            <div class="-mx-1 my-1 h-px bg-border-subtle" role="separator"></div>
          } @else if (isSubmenu(entry)) {
            <button
              type="button"
              arc-menu-item
              arc-menu
              role="menuitem"
              [arcMenuTriggerFor]="submenuTemplates()[entry.submenu]"
              arcPlacement="rightTop"
            >
              <arc-icon [arcType]="entry.icon" />
              {{ entry.label | translate }}
              <arc-icon arcType="chevron-right" class="ml-auto" />
            </button>
          } @else {
            <button type="button" arc-menu-item (click)="run(entry.action)">
              <arc-icon [arcType]="entry.icon" />
              {{ entry.label | translate }}
              @if (entry.shortcut) {
                <span arc-menu-shortcut>{{ entry.shortcut }}</span>
              }
            </button>
          }
        }
      </div>
    </ng-template>

    <ng-template #headingMenu>
      <div arc-menu-content class="w-48">
        @for (entry of headingItems; track entry.action) {
          <button type="button" arc-menu-item (click)="run(entry.action)">
            <arc-icon [arcType]="entry.icon" />
            {{ entry.label | translate }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #listMenu>
      <div arc-menu-content class="w-52">
        @for (entry of listItems; track entry.action) {
          <button type="button" arc-menu-item (click)="run(entry.action)">
            <arc-icon [arcType]="entry.icon" />
            {{ entry.label | translate }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #calloutMenu>
      <div arc-menu-content class="w-48">
        @for (entry of calloutItems; track entry.action) {
          <button type="button" arc-menu-item (click)="run(entry.action)">
            <arc-icon [arcType]="entry.icon" />
            {{ entry.label | translate }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #assetMenu>
      <div arc-menu-content class="w-52">
        @for (entry of assetItems; track entry.action) {
          <button type="button" arc-menu-item (click)="run(entry.action)">
            <arc-icon [arcType]="entry.icon" />
            {{ entry.label | translate }}
          </button>
        }
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppEditorInsertMenuComponent {
  private readonly trigger = viewChild.required(CdkContextMenuTrigger);
  private readonly headingMenu = viewChild.required<TemplateRef<void>>('headingMenu');
  private readonly listMenu = viewChild.required<TemplateRef<void>>('listMenu');
  private readonly calloutMenu = viewChild.required<TemplateRef<void>>('calloutMenu');
  private readonly assetMenu = viewChild.required<TemplateRef<void>>('assetMenu');

  /** Whether the note has a scope to link into (no link or asset entries otherwise, e.g. templates). */
  readonly canLink = input(true);

  readonly action = output<EditorInsertAction>();
  /** The menu closed, with or without a choice: the editor takes the focus back. */
  readonly menuClosed = output<void>();

  protected readonly SEPARATOR = SEPARATOR;
  private readonly entries: readonly InsertMenuEntry[] = [
    item('cut', 'scissors', `${MOD}X`),
    item('copy', 'copy', `${MOD}C`),
    item('paste', 'clipboard-paste', `${MOD}V`),
    SEPARATOR,
    item('bold', 'bold', `${MOD}B`),
    item('italic', 'italic', `${MOD}I`),
    item('strikethrough', 'strikethrough'),
    item('inlineCode', 'code'),
    SEPARATOR,
    submenu('heading', 'heading', 'heading-1'),
    submenu('list', 'list', 'list'),
    item('quote', 'text-quote'),
    item('codeBlock', 'square-code'),
    item('table', 'table'),
    submenu('callout', 'callout', 'info'),
    item('divider', 'separator-horizontal'),
    SEPARATOR,
    item('link', 'link'),
    submenu('asset', 'assetGroup', 'image'),
  ];
  protected readonly headingItems: readonly InsertMenuItem[] = [
    item('heading1', 'heading-1'),
    item('heading2', 'heading-2'),
    item('heading3', 'heading-3'),
  ];
  protected readonly listItems: readonly InsertMenuItem[] = [
    item('bulletList', 'list'),
    item('orderedList', 'list-ordered'),
    item('taskList', 'list-checks'),
  ];
  protected readonly calloutItems: readonly InsertMenuItem[] = [
    item('calloutNote', 'info'),
    item('calloutTip', 'lightbulb'),
    item('calloutWarning', 'triangle-alert'),
    item('calloutDanger', 'octagon-alert'),
  ];
  protected readonly assetItems: readonly InsertMenuItem[] = [
    item('asset', 'image'),
    item('importFile', 'file-up'),
  ];

  protected readonly submenuTemplates = computed<
    Readonly<Record<InsertSubmenu, TemplateRef<void>>>
  >(() => ({
    heading: this.headingMenu(),
    list: this.listMenu(),
    callout: this.calloutMenu(),
    asset: this.assetMenu(),
  }));

  /** Without a scope the link entries go, and so does the separator left trailing before them. */
  protected readonly visibleEntries = computed(() => {
    if (this.canLink()) {
      return this.entries;
    }
    const entries = this.entries.filter(
      (entry) =>
        entry === SEPARATOR ||
        ('action' in entry ? !LINK_ONLY_ACTIONS.includes(entry.action) : entry.submenu !== 'asset'),
    );
    return entries.at(-1) === SEPARATOR ? entries.slice(0, -1) : entries;
  });

  protected isSubmenu(entry: InsertMenuItem | InsertMenuSubmenu): entry is InsertMenuSubmenu {
    return 'submenu' in entry;
  }

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() =>
      this.trigger()
        .closed.pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => this.menuClosed.emit()),
    );

    document.addEventListener('auxclick', this.handleAuxClick, true);
    destroyRef.onDestroy(() => document.removeEventListener('auxclick', this.handleAuxClick, true));
  }

  // Releasing the right button fires an auxclick that the overlay would read as a click outside
  // the menu just opened (its trigger is a hidden element), closing it right away (as in the tab bar).
  private readonly handleAuxClick = (event: MouseEvent) => {
    if (event.button === 2 && this.trigger().isOpen()) {
      event.stopPropagation();
    }
  };

  /** Opens the menu at a screen position (the right-click). */
  open(x: number, y: number): void {
    const trigger = this.trigger();
    trigger.close();
    trigger.open({ x, y });
  }

  protected run(action: EditorInsertAction): void {
    this.action.emit(action);
  }
}
