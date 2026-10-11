import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type OnDestroy,
  ElementRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
  booleanAttribute,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import {
  buttonVariants,
  type ArcTechButtonShapeVariants,
  type ArcTechButtonSizeVariants,
  type ArcTechButtonTypeVariants,
} from './button.variants';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';

@Component({
  selector: 'arc-button, button[arc-button], a[arc-button]',
  imports: [ArcTechIconComponent],
  template: `
    @if (arcLoading()) {
      <arc-icon arcType="loader-circle" class="animate-spin duration-2000" />
    }
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-icon-only]': 'iconOnly() || null',
    '[attr.data-disabled]': 'isNotInsideOfButtonOrLink() && arcDisabled() || null',
    '[attr.aria-disabled]': 'isNotInsideOfButtonOrLink() && arcDisabled() || null',
    '[attr.disabled]': 'isNotInsideOfButtonOrLink() && arcDisabled() ? "" : null',
    '[attr.role]': 'isNotInsideOfButtonOrLink() ? "button" : null',
    '[attr.tabindex]': 'isNotInsideOfButtonOrLink() ? "0" : null',
  },
  exportAs: 'arcButton',
})
export class ArcTechButtonComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly arcType = input<ArcTechButtonTypeVariants>('default');
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');
  readonly arcShape = input<ArcTechButtonShapeVariants>('default');
  readonly class = input<ClassValue>('');
  readonly arcFull = input(false, { transform: booleanAttribute });
  readonly arcLoading = input(false, { transform: booleanAttribute });
  readonly arcDisabled = input(false, { transform: booleanAttribute });

  private readonly iconOnlyState = signal(false);
  readonly iconOnly = this.iconOnlyState.asReadonly();

  private _mutationObserver: MutationObserver | null = null;

  constructor() {
    afterNextRender(() => {
      if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
        return;
      }

      const check = () => {
        const el = this.elementRef.nativeElement;
        const hasIcon = el.querySelector('arc-icon, [arc-icon]') !== null;
        const children = Array.from<Node>(el.childNodes);
        const hasText = children.some(node => {
          if (node.nodeType === 3) {
            return node.textContent?.trim() !== '';
          }
          if (node.nodeType === 1) {
            const element = node as HTMLElement;
            if (element.matches('arc-icon, [arc-icon]')) {
              return false;
            }
            return element.textContent?.trim() !== '';
          }
          return false;
        });

        this.iconOnlyState.set(hasIcon && !hasText);
      };

      check();
      this._mutationObserver = new MutationObserver(check);
      this._mutationObserver.observe(this.elementRef.nativeElement, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
  }

  ngOnDestroy(): void {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }
  }

  protected readonly classes = computed(() =>
    mergeClasses(
      buttonVariants({
        arcType: this.arcType(),
        arcSize: this.arcSize(),
        arcShape: this.arcShape(),
        arcFull: this.arcFull(),
        arcLoading: this.arcLoading(),
        arcDisabled: this.arcDisabled(),
      }),
      this.class(),
    ),
  );

  protected readonly isNotInsideOfButtonOrLink = computed(() => {
    // Evaluated once; assumes component parent doesn't change after mount
    const arcTechButtonElement = this.elementRef.nativeElement;
    if (arcTechButtonElement.parentElement) {
      const { tagName } = arcTechButtonElement.parentElement;
      return tagName !== 'BUTTON' && tagName !== 'A';
    }
    return true;
  });
}
