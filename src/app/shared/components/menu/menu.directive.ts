import type { BooleanInput } from '@angular/cdk/coercion';
import { CdkMenuTrigger } from '@angular/cdk/menu';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import { isPlatformBrowser } from '@angular/common';
import {
  booleanAttribute,
  computed,
  Directive,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  input,
  type OnDestroy,
  type OnInit,
  PLATFORM_ID,
  type TemplateRef,
  untracked,
} from '@angular/core';

import { ArcTechMenuManagerService } from './menu-manager.service';
import { MENU_POSITIONS_MAP, type ArcTechMenuPlacement } from './menu-positions';

export type ArcTechMenuTrigger = 'click' | 'hover';

@Directive({
  selector: '[arc-menu]',
  standalone: true,
  host: {
    role: 'button',
    '[attr.aria-haspopup]': "'menu'",
    '[attr.aria-expanded]': 'cdkTrigger.isOpen()',
    '[attr.data-state]': "cdkTrigger.isOpen() ? 'open': 'closed'",
    '[attr.data-disabled]': "arcDisabled() ? '' : undefined",
    '[style.cursor]': "'pointer'",
  },
  hostDirectives: [
    {
      directive: CdkMenuTrigger,
      inputs: ['cdkMenuTriggerFor: arcMenuTriggerFor'],
    },
  ],
})
export class ArcTechMenuDirective implements OnInit, OnDestroy {
  private static readonly MENU_CONTENT_SELECTOR = '.cdk-overlay-pane [arc-menu-content]';

  protected readonly cdkTrigger = inject(CdkMenuTrigger, { host: true });
  private readonly document = inject(DOCUMENT);
  private readonly elementRef = inject(ElementRef);
  private readonly menuManager = inject(ArcTechMenuManagerService);
  private readonly platformId = inject(PLATFORM_ID);

  private closeTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanupFunctions: Array<() => void> = [];

  readonly arcMenuTriggerFor = input.required<TemplateRef<void>>();
  readonly arcDisabled = input<boolean, BooleanInput>(false, { transform: booleanAttribute });
  readonly arcTrigger = input<ArcTechMenuTrigger>('click');
  readonly arcHoverDelay = input<number>(100);
  readonly arcPlacement = input<ArcTechMenuPlacement>('bottomLeft');

  private readonly menuPositions = computed(() => this.getPositionsByPlacement(this.arcPlacement()));

  constructor() {
    effect(() => {
      const positions = this.menuPositions();
      untracked(() => {
        this.cdkTrigger.menuPosition = positions;
      });
    });
  }

  private getPositionsByPlacement(placement: ArcTechMenuPlacement): ConnectedPosition[] {
    return MENU_POSITIONS_MAP[placement] || MENU_POSITIONS_MAP['bottomLeft'];
  }

  ngOnInit(): void {
    const isMobile = this.isMobileDevice();

    // If trigger is hover but device is mobile, skip hover behavior
    // The CDK MenuTrigger will handle click by default
    if (this.arcTrigger() === 'hover' && !isMobile) {
      this.initializeHoverBehavior();
    }
  }

  ngOnDestroy(): void {
    this.cancelScheduledClose();
    this.menuManager.unregisterHoverMenu(this);
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions.length = 0;
  }

  close(): void {
    this.cancelScheduledClose();
    this.cdkTrigger.close();
  }

  private initializeHoverBehavior(): void {
    this.setupTriggerListeners();
    this.setupMenuOpenListener();
  }

  private setupTriggerListeners(): void {
    const element = this.elementRef.nativeElement;

    this.addEventListenerWithCleanup(element, 'mouseenter', () => {
      if (this.arcDisabled()) {
        return;
      }

      this.cancelScheduledClose();
      this.menuManager.registerHoverMenu(this);
      this.cdkTrigger.open();
    });

    this.addEventListenerWithCleanup(element, 'mouseleave', event => this.scheduleCloseIfNeeded(event as MouseEvent));
  }

  private setupMenuOpenListener(): void {
    const openSubscription = this.cdkTrigger.opened.subscribe(() => {
      setTimeout(() => this.setupMenuContentListeners(), 0);
    });

    const closeSubscription = this.cdkTrigger.closed.subscribe(() => {
      this.menuManager.unregisterHoverMenu(this);
    });

    this.cleanupFunctions.push(
      () => openSubscription.unsubscribe(),
      () => closeSubscription.unsubscribe(),
    );
  }

  private setupMenuContentListeners(): void {
    const menuContent = this.document.querySelector(ArcTechMenuDirective.MENU_CONTENT_SELECTOR);
    if (!menuContent) {
      return;
    }

    this.addEventListenerWithCleanup(menuContent, 'mouseenter', () => this.cancelScheduledClose());
    this.addEventListenerWithCleanup(menuContent, 'mouseleave', event =>
      this.scheduleCloseIfNeeded(event as MouseEvent),
    );
  }

  private cancelScheduledClose(): void {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout);
      this.closeTimeout = null;
    }
  }

  private scheduleCloseIfNeeded(event: MouseEvent): void {
    if (this.shouldKeepMenuOpen(event.relatedTarget as Element)) {
      return;
    }

    this.scheduleMenuClose();
  }

  private shouldKeepMenuOpen(relatedTarget: Element | null): boolean {
    if (!relatedTarget) {
      return false;
    }

    const isMovingToTrigger = this.elementRef.nativeElement.contains(relatedTarget);
    const isMovingToMenu = relatedTarget.closest(ArcTechMenuDirective.MENU_CONTENT_SELECTOR);
    const isMovingToOtherTrigger =
      relatedTarget.matches('[arc-menu]') && !this.elementRef.nativeElement.contains(relatedTarget);

    if (isMovingToOtherTrigger) {
      return false;
    }

    return isMovingToTrigger || !!isMovingToMenu;
  }

  private scheduleMenuClose(): void {
    this.closeTimeout = setTimeout(() => {
      this.cdkTrigger.close();
    }, this.arcHoverDelay());
  }

  private addEventListenerWithCleanup(
    element: Element,
    eventType: string,
    handler: (event: MouseEvent | Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    if (isPlatformBrowser(this.platformId)) {
      element.addEventListener(eventType, handler, options);
      this.cleanupFunctions.push(() => element.removeEventListener(eventType, handler, options));
    }
  }

  private isMobileDevice(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false; // Default to desktop behavior on server
    }

    const window = this.document.defaultView;
    if (!window) {
      return false;
    }

    const { navigator } = window;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Check for mobile user agent
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const isMobileUA = mobileRegex.test(navigator.userAgent);

    // Check viewport width for small screens
    const isSmallScreen = window.innerWidth <= 768;

    return hasTouch && (isMobileUA || isSmallScreen);
  }
}
