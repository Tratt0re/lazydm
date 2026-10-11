import { Overlay, OverlayPositionBuilder, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  numberAttribute,
  type OnDestroy,
  type OnInit,
  output,
  PLATFORM_ID,
  Renderer2,
  runInInjectionContext,
  signal,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import { filter, map, of, Subject, switchMap, tap, timer } from 'rxjs';

import { TOOLTIP_POSITIONS_MAP } from '@/shared/components/tooltip/tooltip-positions';
import {
  tooltipPositionVariants,
  tooltipVariants,
  type ArcTechTooltipPositionVariants,
} from '@/shared/components/tooltip/tooltip.variants';
import { ArcTechIdDirective } from '@/shared/core';
import { ArcTechStringTemplateOutletDirective } from '@/shared/core/directives/string-template-outlet/string-template-outlet.directive';
import { mergeClasses } from '@/shared/utils/merge-classes';

export type ArcTechTooltipTriggers = 'click' | 'hover';
export type ArcTechTooltipType = string | TemplateRef<void> | null;

interface DelayConfig {
  isShow: boolean;
  delay: number;
}

const throttle = (callback: () => void, wait: number) => {
  let time = Date.now();
  return function () {
    if (time + wait - Date.now() < 0) {
      callback();
      time = Date.now();
    }
  };
};

@Directive({
  selector: '[arcTooltip]',
  host: {
    style: 'cursor: pointer',
  },
  exportAs: 'arcTooltip',
})
export class ArcTechTooltipDirective implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly overlay = inject(Overlay);
  private readonly overlayPositionBuilder = inject(OverlayPositionBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer = inject(Renderer2);

  private delaySubject?: Subject<DelayConfig>;
  private componentRef?: ComponentRef<ArcTechTooltipComponent>;
  private listenersRefs: (() => void)[] = [];
  private overlayRef?: OverlayRef;
  private ariaEffectRef?: ReturnType<typeof effect>;

  readonly arcPosition = input<ArcTechTooltipPositionVariants>('top');
  readonly arcTrigger = input<ArcTechTooltipTriggers>('hover');
  readonly arcTooltip = input<ArcTechTooltipType>(null);
  readonly arcShowDelay = input(150, { transform: numberAttribute });
  readonly arcHideDelay = input(100, { transform: numberAttribute });

  readonly arcShow = output<void>();
  readonly arcHide = output<void>();

  private readonly tooltipText = computed<string | TemplateRef<void>>(() => {
    let tooltipText = this.arcTooltip();
    if (!tooltipText) {
      return '';
    } else if (typeof tooltipText === 'string') {
      tooltipText = tooltipText.trim();
    }
    return tooltipText;
  });

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const positionStrategy = this.overlayPositionBuilder
        .flexibleConnectedTo(this.elementRef)
        .withPositions([TOOLTIP_POSITIONS_MAP[this.arcPosition()]]);
      this.overlayRef = this.overlay.create({ positionStrategy });

      runInInjectionContext(this.injector, () => {
        toObservable(this.arcTrigger)
          .pipe(
            tap(() => {
              this.setupDelayMechanism();
              this.cleanupTriggerEvents();
              this.initTriggers();
            }),
            filter(() => !!this.overlayRef),
            switchMap(() => (this.overlayRef as OverlayRef).outsidePointerEvents()),
            filter(event => !this.elementRef.nativeElement.contains(event.target)),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(() => this.delay(false, 0));
      });
    }
  }

  ngOnDestroy(): void {
    // Clean up any pending effect
    if (this.ariaEffectRef) {
      this.ariaEffectRef.destroy();
      this.ariaEffectRef = undefined;
    }

    this.delaySubject?.complete();
    this.cleanupTriggerEvents();
    this.overlayRef?.dispose();
  }

  private initTriggers() {
    this.initScrollListener();
    this.initClickListeners();
    this.initHoverListeners();
  }

  private initClickListeners(): void {
    if (this.arcTrigger() !== 'click') {
      return;
    }

    this.listenersRefs = [
      ...this.listenersRefs,
      this.renderer.listen(this.elementRef.nativeElement, 'click', () => {
        const shouldShowTooltip = !this.overlayRef?.hasAttached();
        const delay = shouldShowTooltip ? this.arcShowDelay() : this.arcHideDelay();
        this.delay(shouldShowTooltip, delay);
      }),
    ];
  }

  private initHoverListeners(): void {
    if (this.arcTrigger() !== 'hover') {
      return;
    }

    this.listenersRefs = [
      ...this.listenersRefs,
      this.renderer.listen(this.elementRef.nativeElement, 'mouseenter', () => this.delay(true, this.arcShowDelay())),
      this.renderer.listen(this.elementRef.nativeElement, 'mouseleave', () => this.delay(false, this.arcHideDelay())),
      this.renderer.listen(this.elementRef.nativeElement, 'focus', () => this.delay(true, this.arcShowDelay())),
      this.renderer.listen(this.elementRef.nativeElement, 'blur', () => this.delay(false, this.arcHideDelay())),
    ];
  }

  private initScrollListener(): void {
    this.listenersRefs = [
      ...this.listenersRefs,
      this.renderer.listen(
        this.document.defaultView,
        'scroll',
        throttle(() => this.delay(false, 0), 100),
      ),
    ];
  }

  private cleanupTriggerEvents(): void {
    for (const eventRef of this.listenersRefs) {
      eventRef();
    }
    this.listenersRefs = [];
  }

  private delay(isShow: boolean, delay = -1): void {
    this.delaySubject?.next({ isShow, delay });
  }

  private setupDelayMechanism(): void {
    this.delaySubject?.complete();
    this.delaySubject = new Subject<DelayConfig>();

    this.delaySubject
      .pipe(
        switchMap(config => (config.delay < 0 ? of(config) : timer(config.delay).pipe(map(() => config)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(config => {
        if (config.isShow) {
          this.show();
        } else {
          this.hide();
        }
      });
  }

  private show() {
    if (this.componentRef || !this.tooltipText()) {
      return;
    }

    const tooltipPortal = new ComponentPortal(ArcTechTooltipComponent);
    this.componentRef = this.overlayRef?.attach(tooltipPortal);
    this.componentRef?.onDestroy(() => {
      this.componentRef = undefined;
    });
    this.componentRef?.instance.state.set('opened');
    this.componentRef?.instance.setProps(this.tooltipText(), this.arcPosition());
    runInInjectionContext(this.injector, () => {
      this.ariaEffectRef = effect(() => {
        const tooltipId = this.componentRef?.instance.uniqueId()?.id();
        if (tooltipId) {
          this.renderer.setAttribute(this.elementRef.nativeElement, 'aria-describedby', tooltipId);
          this.ariaEffectRef?.destroy();
          this.ariaEffectRef = undefined;
        }
      });
    });
    this.arcShow.emit();
  }

  private hide() {
    if (!this.componentRef) {
      return;
    }

    // Clean up any pending effect
    if (this.ariaEffectRef) {
      this.ariaEffectRef.destroy();
      this.ariaEffectRef = undefined;
    }

    this.renderer.removeAttribute(this.elementRef.nativeElement, 'aria-describedby');
    this.componentRef.instance.state.set('closed');
    this.arcHide.emit();
    this.overlayRef?.detach();
  }
}

@Component({
  selector: 'arc-tooltip',
  imports: [ArcTechStringTemplateOutletDirective, ArcTechIdDirective],
  template: `
    <ng-container *arcStringTemplateOutlet="tooltipText()" arcTechId="tooltip" #z="arcTechId">{{ tooltipText() }}</ng-container>

    <span [class]="arrowClasses()">
      <svg
        class="bg-primary fill-primary z-50 block size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-none"
        width="10"
        height="5"
        viewBox="0 0 30 10"
        preserveAspectRatio="none"
      >
        <polygon points="0,0 30,0 15,10" />
      </svg>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.id]': 'tooltipId()',
    '[attr.data-side]': 'position()',
    '[attr.data-state]': 'state()',
    role: 'tooltip',
  },
})
export class ArcTechTooltipComponent {
  protected readonly arrowClasses = computed(() =>
    mergeClasses(tooltipPositionVariants({ position: this.position() })),
  );

  protected readonly classes = computed(() => mergeClasses(tooltipVariants()));
  protected readonly position = signal<ArcTechTooltipPositionVariants>('top');
  readonly state = signal<'closed' | 'opened'>('closed');
  readonly uniqueId = viewChild<ArcTechIdDirective>('z');
  protected readonly tooltipText = signal<ArcTechTooltipType>(null);
  protected readonly tooltipId = computed(() => this.uniqueId()?.id() ?? 'tooltip');

  setProps(tooltipText: ArcTechTooltipType, position: ArcTechTooltipPositionVariants) {
    if (tooltipText) {
      this.tooltipText.set(tooltipText);
    }
    this.position.set(position);
  }
}
