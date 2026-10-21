import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LayoutImports } from '@/shared/components/layout/layout.imports';
import { VaultSyncStatusComponent } from '@/components/vault-sync-status/vault-sync-status.component';
import { Sidebar } from '../sidebar/sidebar';
import { TabBar } from '../tab-bar/tab-bar';
import { Toolbar } from '../toolbar/toolbar';
import { MenuConfiguration, type MenuSectionConfig } from '@/config/menu.config';
import { CampaignService } from '@/services/campaign.service';
import { SectionService } from '@/services/section.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { detectSmallScreenViewport } from '@/shared/utils';
import { listenToIpcEvent } from '@/services/ipc-events';
import { UpdateModalComponent } from '@/shared/components/update-modal/update-modal.component';
import { UpdateService } from '@/shared/core/services/update.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root-layout',
  imports: [
    ...LayoutImports,
    RouterOutlet,
    TranslatePipe,
    Toolbar,
    Sidebar,
    TabBar,
    VaultSyncStatusComponent,
    UpdateModalComponent,
  ],
  templateUrl: './root-layout.html',
  encapsulation: ViewEncapsulation.None,
})
export class RootLayout implements OnInit {
  private readonly toolbarContextService = inject(ToolbarContextService);
  protected readonly updateService = inject(UpdateService);
  private readonly handleFullscreenChangeEvent = (payload: unknown) => {
    this.isFullscreen.set(this.resolveFullscreenState(payload));
  };

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
  protected readonly toolbarTitle = this.toolbarContextService.title;
  protected readonly toolbarTitleMode = this.toolbarContextService.titleMode;
  protected readonly toolbarTitleBreadcrumbs = this.toolbarContextService.titleBreadcrumbs;
  protected readonly toolbarItemActions = this.toolbarContextService.itemActions;
  protected readonly toolbarItemNavigation = this.toolbarContextService.itemNavigation;

  constructor() {
    if (this.isSmallScreen()) {
      this.sidebarCollapsed.set(true);
    }

    listenToIpcEvent('window:fullscreenChanged', this.handleFullscreenChangeEvent);
  }

  ngOnInit(): void {
    this.isFullscreen.set(this.readDocumentFullscreenState());
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
