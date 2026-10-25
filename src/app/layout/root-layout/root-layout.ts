import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LayoutImports } from '@/shared/components/layout/layout.imports';
import { AppMenuService } from '@/services/app-menu.service';
import { WorkspaceService } from '@/services/workspace.service';
import { Pane } from '../pane/pane';
import { Sidebar } from '../sidebar/sidebar';
import { MenuConfiguration, type MenuSectionConfig } from '@/config/menu.config';
import { CampaignService } from '@/services/campaign.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { SectionService } from '@/services/section.service';
import { detectSmallScreenViewport } from '@/shared/utils';
import { listenToIpcEvent } from '@/services/ipc-events';
import { UpdateModalComponent } from '@/shared/components/update-modal/update-modal.component';
import { UpdateService } from '@/shared/core/services/update.service';

/** Narrowest width of a pane of the split screen. */
const MIN_PANE_WIDTH_PX = 360;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root-layout',
  imports: [...LayoutImports, CdkDropListGroup, TranslatePipe, Sidebar, Pane, UpdateModalComponent],
  templateUrl: './root-layout.html',
  encapsulation: ViewEncapsulation.None,
})
export class RootLayout implements OnInit {
  private readonly appMenu = inject(AppMenuService);
  protected readonly updateService = inject(UpdateService);
  private readonly handleFullscreenChangeEvent = (payload: unknown) => {
    this.isFullscreen.set(this.resolveFullscreenState(payload));
  };

  protected readonly workspace = inject(WorkspaceService);
  private readonly localPreferences = inject(LocalPreferencesService);
  private readonly panesElement = viewChild<ElementRef<HTMLElement>>('panes');
  protected readonly hasSplit = this.workspace.hasSplit;

  /** Narrowest a pane is allowed to get; a window too narrow for two of them shows one pane at a time. */
  protected readonly minPaneWidth = MIN_PANE_WIDTH_PX;
  private readonly panesWidth = signal(0);
  /** Share of the width the first pane takes (dragged with the divider, remembered on this device). */
  private readonly ratio = signal(this.localPreferences.getSplitRatio());
  protected readonly isResizing = signal(false);
  protected readonly isNarrow = computed(
    () => this.panesWidth() > 0 && this.panesWidth() < 2 * MIN_PANE_WIDTH_PX,
  );
  /** The share, kept so both panes stay at least `minPaneWidth` wide. */
  protected readonly leftGrow = computed(() => {
    const width = this.panesWidth();
    const min = width > 0 ? Math.min(MIN_PANE_WIDTH_PX / width, 0.5) : 0.1;
    return Math.min(Math.max(this.ratio(), min), 1 - min);
  });
  protected readonly ratioPercent = computed(() => Math.round(this.leftGrow() * 100));
  /** In a narrow window only the focused pane shows. */
  protected readonly showLeft = computed(
    () => !this.hasSplit() || !this.isNarrow() || this.workspace.focusedPane() === 'left',
  );
  protected readonly showRight = computed(
    () => this.hasSplit() && (!this.isNarrow() || this.workspace.focusedPane() === 'right'),
  );

  protected readonly sidebarCollapsed = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly isSmallScreen = signal(detectSmallScreenViewport());
  private readonly campaignService = inject(CampaignService);
  private readonly sectionService = inject(SectionService);
  protected readonly menuSections = computed<readonly MenuSectionConfig[]>(() =>
    MenuConfiguration.forCampaign(
      this.campaignService.activeCampaign()?.slug ?? null,
      this.sectionService.visibleCampaignSections(),
    ),
  );
  protected readonly showSidebarOverlay = computed(
    () => this.isSmallScreen() && !this.sidebarCollapsed(),
  );
  constructor() {
    if (this.isSmallScreen()) {
      this.sidebarCollapsed.set(true);
    }

    listenToIpcEvent('window:fullscreenChanged', this.handleFullscreenChangeEvent);

    this.observePanesWidth();

    // The menu's *Toggle the Sidebar* acts on this shell while it is shown.
    this.appMenu.onToggleSidebar = () => this.toggleSidebar();
    inject(DestroyRef).onDestroy(() => (this.appMenu.onToggleSidebar = null));
  }

  ngOnInit(): void {
    this.isFullscreen.set(this.readDocumentFullscreenState());
  }

  /** The width the panes share changes with the window and the sidebar. */
  private observePanesWidth(): void {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const panes = this.panesElement()?.nativeElement;
      if (!panes || typeof ResizeObserver === 'undefined') {
        return;
      }

      const observer = new ResizeObserver(([entry]) =>
        this.panesWidth.set(entry.contentRect.width),
      );
      observer.observe(panes);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected startResize(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.isResizing.set(true);
  }

  protected resize(event: PointerEvent): void {
    const panes = this.panesElement()?.nativeElement;
    if (!this.isResizing() || !panes) {
      return;
    }

    const rect = panes.getBoundingClientRect();
    this.ratio.set((event.clientX - rect.left) / rect.width);
  }

  protected endResize(event: PointerEvent): void {
    if (!this.isResizing()) {
      return;
    }

    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.isResizing.set(false);
    this.localPreferences.setSplitRatio(this.leftGrow());
  }

  /** The divider's keys: arrows move it by 2%, Home / End to the narrowest panes, double-click to the middle. */
  protected onDividerKeyDown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    const next =
      event.key === 'ArrowLeft'
        ? this.leftGrow() - step
        : event.key === 'ArrowRight'
          ? this.leftGrow() + step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 1
              : null;
    if (next === null) {
      return;
    }

    event.preventDefault();
    this.ratio.set(next);
    this.localPreferences.setSplitRatio(this.leftGrow());
  }

  protected resetRatio(): void {
    this.ratio.set(0.5);
    this.localPreferences.setSplitRatio(0.5);
  }

  protected setSidebarCollapsed(isCollapsed: boolean): void {
    this.sidebarCollapsed.set(isCollapsed);
  }

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((isCollapsed) => !isCollapsed);
  }

  protected closeSidebarOverlay(): void {
    this.sidebarCollapsed.set(true);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    const isSmall = detectSmallScreenViewport();
    if (isSmall === this.isSmallScreen()) {
      return;
    }

    this.isSmallScreen.set(isSmall);

    if (isSmall) {
      this.sidebarCollapsed.set(true);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKeyDown(): void {
    if (this.showSidebarOverlay()) {
      this.closeSidebarOverlay();
    }
  }

  @HostListener('document:fullscreenchange')
  protected onDocumentFullscreenChange(): void {
    this.isFullscreen.set(this.readDocumentFullscreenState());
  }

  private readDocumentFullscreenState(): boolean {
    return typeof document !== 'undefined' && document.fullscreenElement !== null;
  }

  private resolveFullscreenState(payload: unknown): boolean {
    if (typeof payload === 'boolean') {
      return payload;
    }

    if (payload && typeof payload === 'object' && 'isFullscreen' in payload) {
      return payload.isFullscreen === true;
    }

    return this.readDocumentFullscreenState();
  }
}
