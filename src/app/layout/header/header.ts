import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { HeaderSearchComponent } from '@/components/header-search/header-search.component';
import { type AppSheetKind, AppSheetService } from '@/services/app-sheet.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

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
  /** Title-bar buttons of the full-page sheets: icon only, the name is the tooltip. */
  protected readonly sheetButtons: readonly {
    kind: AppSheetKind;
    label: string;
    icon: ArcTechIcon;
  }[] = [
    { kind: 'compendium', label: 'nav.items.compendium', icon: 'library-big' },
    { kind: 'templates', label: 'nav.items.templates', icon: 'layout-template' },
    { kind: 'settings', label: 'nav.items.settings', icon: 'settings' },
  ];
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
      .catch(() => undefined);
    window.electronAPI?.onIpcEvent?.(MAXIMIZED_CHANGED_EVENT, this.handleMaximizedChanged);
    window.electronAPI?.onIpcEvent?.(FULLSCREEN_CHANGED_EVENT, this.handleFullscreenChanged);

    inject(DestroyRef).onDestroy(() => {
      window.electronAPI?.offIpcEvent?.(MAXIMIZED_CHANGED_EVENT, this.handleMaximizedChanged);
      window.electronAPI?.offIpcEvent?.(FULLSCREEN_CHANGED_EVENT, this.handleFullscreenChanged);
    });
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
