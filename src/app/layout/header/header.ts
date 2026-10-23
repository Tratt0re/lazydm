import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { matchesShortcut } from '@/config/shortcuts.config';
import { HeaderSearchComponent } from '@/components/header-search/header-search.component';
import { type AppSheetKind, AppSheetService } from '@/services/app-sheet.service';
import { ShortcutsSheetService } from '@/services/shortcuts-sheet.service';
import { VaultService } from '@/services/vault.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { listenToIpcEvent } from '@/services/ipc-events';

const MAXIMIZED_CHANGED_EVENT = 'window:maximizedChanged';
const FULLSCREEN_CHANGED_EVENT = 'window:fullscreenChanged';

/**
 * Title bar of the app window: drag area, app name, the Compendium and Settings sheets, and the window
 * buttons (native traffic lights on macOS, the app's own buttons elsewhere).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-header',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechTooltipImports,
    HeaderSearchComponent,
  ],
  templateUrl: './header.html',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'block shrink-0',
  },
})
export class Header {
  protected readonly sheets = inject(AppSheetService);
  protected readonly workspace = inject(WorkspaceService);
  protected readonly shortcutsSheet = inject(ShortcutsSheetService);
  /** Title-bar buttons of the full-page sheets: icon only, the name is the tooltip. */
  protected readonly sheetButtons: readonly {
    kind: AppSheetKind;
    label: string;
    icon: ArcTechIcon;
  }[] = [
    { kind: 'compendium', label: 'nav.items.compendium', icon: 'book-marked' },
    { kind: 'templates', label: 'nav.items.templates', icon: 'layout-template' },
    { kind: 'battle-rules', label: 'nav.items.battleRules', icon: 'dices' },
    { kind: 'settings', label: 'nav.items.settings', icon: 'settings' },
  ];
  /** On the left (Windows, Linux) the buttons read settings first; on the right (macOS) the order above. */
  protected readonly orderedSheetButtons = window.electronAPI?.platform === 'darwin'
    ? this.sheetButtons
    : [...this.sheetButtons].reverse();
  protected readonly vault = inject(VaultService).currentVault;
  protected readonly isDesktop = Boolean(window.electronAPI);
  protected readonly isMac = window.electronAPI?.platform === 'darwin';
  protected readonly isMaximized = signal(false);
  protected readonly isFullscreen = signal(false);

  private readonly handleMaximizedChanged = (payload: unknown) =>
    this.isMaximized.set(this.readFlag(payload, 'isMaximized'));
  private readonly handleFullscreenChanged = (payload: unknown) =>
    this.isFullscreen.set(this.readFlag(payload, 'isFullscreen'));

  constructor() {
    window.electronAPI?.ipcClient?.window
      ?.getState()
      .then((state) => {
        this.isMaximized.set(state.isMaximized);
        this.isFullscreen.set(state.isFullscreen);
      })
      .catch((error) => console.warn('[app] Failed to read the window state:', error));
    listenToIpcEvent(MAXIMIZED_CHANGED_EVENT, this.handleMaximizedChanged);
    listenToIpcEvent(FULLSCREEN_CHANGED_EVENT, this.handleFullscreenChanged);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (this.vault() && matchesShortcut(event, 'shortcuts')) {
      event.preventDefault();
      this.shortcutsSheet.toggle();
    }
  }

  protected minimize(): void {
    void window.electronAPI?.ipcClient?.window.minimize();
  }

  protected toggleMaximize(): void {
    void window.electronAPI?.ipcClient?.window.toggleMaximize();
  }

  protected close(): void {
    void window.electronAPI?.ipcClient?.window.close();
  }

  /** macOS handles the title bar double-click itself; frameless windows elsewhere need it here. */
  protected onDoubleClick(event: MouseEvent): void {
    if (!this.isMac && event.target === event.currentTarget) {
      this.toggleMaximize();
    }
  }

  private readFlag(payload: unknown, key: string): boolean {
    return Boolean(
      payload && typeof payload === 'object' && (payload as Record<string, unknown>)[key],
    );
  }
}
