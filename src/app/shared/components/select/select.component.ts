import {
  Overlay,
  OverlayModule,
  OverlayPositionBuilder,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { isPlatformBrowser } from '@angular/common';
import {
  type AfterContentInit,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  model,
  type OnDestroy,
  output,
  PLATFORM_ID,
  runInInjectionContext,
  signal,
  type TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';
import { filter } from 'rxjs';

import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechIconComponent } from '@/shared/components/icon';
import type { ArcTechIcon } from '@/shared/components/icon';
import { ARCTECH_ICONS } from '@/shared/components/icon';
import { ArcTechSelectItemComponent } from '@/shared/components/select/select-item.component';
import {
  selectContentVariants,
  selectTriggerVariants,
  selectVariants,
  type ArcTechSelectSizeVariants,
} from '@/shared/components/select/select.variants';
import { mergeClasses, transform } from '@/shared/utils/merge-classes';

type OnTouchedType = () => void;
type OnChangeType = (value: string) => void;
interface SelectSingleVisual {
  readonly label: string;
  readonly icon: ArcTechIcon | null;
  readonly colorHex: string | null;
}

const COMPACT_MODE_WIDTH_THRESHOLD = 100;
let nextSelectInstanceId = 0;

@Component({
  selector: 'arc-select, [arc-select]',
  imports: [OverlayModule, ArcTechBadgeComponent, ArcTechIconComponent],
  template: `
    <button
      #triggerButton
      type="button"
      role="combobox"
      [attr.id]="triggerId()"
      [attr.aria-controls]="popupId()"
      [attr.aria-labelledby]="ariaLabelledBy()"
      [attr.aria-label]="ariaLabel()"
      [class]="triggerClasses()"
      [disabled]="arcDisabled()"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-haspopup]="'listbox'"
      [attr.data-placeholder]="!arcValue() ? '' : null"
      (blur)="!isOpen() && isFocus.set(false)"
      (click)="toggle()"
      (focus)="onFocus()"
    >
      <span class="flex flex-1 flex-wrap items-center gap-2 min-w-0">
        @if (selectedSingleVisual(); as selectedVisual) {
          @if (selectedVisual.colorHex; as colorHex) {
            <span
              class="inline-block h-3.5 w-6 shrink-0 rounded-sm border border-border/70"
              [style.backgroundColor]="colorHex"
            ></span>
          }
          @if (selectedVisual.icon; as iconType) {
            <arc-icon [arcType]="iconType" class="size-3.5 shrink-0" />
          }
          @if (arcShowSelectedLabel()) {
            <span class="truncate">{{ selectedVisual.label }}</span>
          }
        } @else {
          @for (label of selectedLabels(); track $index) {
            @if (arcMultiple()) {
              <arc-badge arcType="secondary">
                <span class="truncate">{{ label }}</span>
              </arc-badge>
            } @else {
              <span class="truncate">{{ label }}</span>
            }
          } @empty {
            <span class="text-muted-foreground truncate">{{ arcPlaceholder() }}</span>
          }
        }
      </span>
      <arc-icon arcType="chevron-down" arcSize="lg" [class]="chevronClasses()" />
    </button>

    <ng-template #dropdownTemplate>
      <div
        [attr.id]="popupId()"
        [class]="contentClasses()"
        role="listbox"
        [attr.aria-labelledby]="triggerId()"
        [attr.data-state]="'open'"
        (keydown.{arrowdown,arrowup,enter,space,escape,home,end}.prevent)="
          onDropdownKeydown($event)
        "
        tabindex="-1"
      >
        <div class="p-1">
          <ng-content />
        </div>
      </div>
    </ng-template>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechSelectComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-active]': 'isFocus() ? "" : null',
    '[attr.data-disabled]': 'arcDisabled() ? "" : null',
    '[attr.data-state]': 'isOpen() ? "open" : "closed"',
    '[class]': 'classes()',
    '(keydown.{enter,space,arrowdown,arrowup,escape}.prevent)': 'onTriggerKeydown($event)',
  },
})
export class ArcTechSelectComponent implements ControlValueAccessor, AfterContentInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly overlay = inject(Overlay);
  private readonly overlayPositionBuilder = inject(OverlayPositionBuilder);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly instanceId = ++nextSelectInstanceId;

  readonly dropdownTemplate = viewChild.required<TemplateRef<void>>('dropdownTemplate');
  readonly triggerButton = viewChild.required<ElementRef<HTMLButtonElement>>('triggerButton');
  readonly selectItems = contentChildren(ArcTechSelectItemComponent);

  private overlayRef?: OverlayRef;
  private portal?: TemplatePortal;
  private readonly triggerIdValue = signal(`arc-select-${this.instanceId}`);
  private readonly popupIdValue = signal(`arc-select-${this.instanceId}-listbox`);
  private readonly externalLabelId = signal<string | null>(null);
  private readonly hostAriaLabel = signal<string | null>(null);

  readonly class = input<ClassValue>('');
  readonly arcDisabled = input(false, { transform });
  readonly arcLabel = input<string>('');
  readonly arcMaxLabelCount = input<number>(1);
  readonly arcMultiple = input<boolean>(false);
  readonly arcPlaceholder = input<string>('Select an option...');
  readonly arcSize = input<ArcTechSelectSizeVariants>('default');
  readonly arcShowSelectedLabel = input(true, { transform });
  readonly arcChevronClass = input<ClassValue>('opacity-50');
  readonly arcValue = model<string | string[]>(this.arcMultiple() ? [] : '');

  readonly arcSelectionChange = output<string | string[]>();

  readonly isOpen = signal(false);
  readonly focusedIndex = signal<number>(-1);
  protected readonly isFocus = signal(false);
  protected readonly isCompact = signal(false);
  protected readonly triggerId = computed(() => this.triggerIdValue());
  protected readonly popupId = computed(() => this.popupIdValue());
  protected readonly ariaLabelledBy = computed(() => this.externalLabelId());
  protected readonly ariaLabel = computed(() => {
    if (this.externalLabelId()) {
      return null;
    }

    const explicitAriaLabel = this.hostAriaLabel()?.trim();
    if (explicitAriaLabel) {
      return explicitAriaLabel;
    }

    const manualLabel = this.arcLabel().trim();
    if (manualLabel.length > 0) {
      return manualLabel;
    }

    const placeholder = this.arcPlaceholder().trim();
    return placeholder.length > 0 ? placeholder : 'Select an option';
  });

  protected onFocus(): void {
    if (this.isCompact()) {
      this.isFocus.set(true);
    }
  }

  // Compute the label based on selected value
  readonly selectedLabels = computed<string[]>(() => {
    const selectedValue = this.arcValue();
    if (this.arcMultiple() && Array.isArray(selectedValue)) {
      return this.provideLabelsForMultiselectMode(selectedValue);
    }

    return this.provideLabelForSingleSelectMode(selectedValue as string);
  });

  protected readonly selectedSingleVisual = computed<SelectSingleVisual | null>(() => {
    if (this.arcMultiple()) {
      return null;
    }

    const selectedValue = this.arcValue();
    if (typeof selectedValue !== 'string' || selectedValue.length === 0) {
      return null;
    }

    const selectedItem = this.getMatchingItem(selectedValue);
    if (!selectedItem) {
      if (!this.arcShowSelectedLabel() && this.isRegisteredIcon(selectedValue)) {
        return {
          label: selectedValue,
          icon: selectedValue,
          colorHex: null,
        };
      }

      return null;
    }

    const icon = selectedItem.arcIcon();
    const colorHex = selectedItem.arcColorHex();

    if (!icon && !colorHex) {
      return null;
    }

    return {
      label: selectedItem.label() || selectedValue,
      icon,
      colorHex,
    };
  });

  private onChange: OnChangeType = (_value: string) => {
    // ControlValueAccessor onChange callback
  };

  private onTouched: OnTouchedType = () => {
    // ControlValueAccessor onTouched callback
  };

  protected readonly classes = computed(() => mergeClasses(selectVariants(), this.class()));
  protected readonly contentClasses = computed(() => mergeClasses(selectContentVariants()));
  protected readonly chevronClasses = computed(() => mergeClasses(this.arcChevronClass()));
  protected readonly triggerClasses = computed(() =>
    mergeClasses(
      selectTriggerVariants({
        arcSize: this.arcSize(),
      }),
    ),
  );

  ngAfterContentInit() {
    this.syncAccessibilityBindings();
    this.syncSelectItems();
  }

  ngOnDestroy() {
    this.destroyOverlay();
  }

  onTriggerKeydown(event: Event) {
    const { key } = event as KeyboardEvent;
    switch (key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
      case 'ArrowUp':
        if (!this.isOpen()) {
          this.open();
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          this.close();
        }
        break;
    }
  }

  onDropdownKeydown(e: Event) {
    const { key } = e as KeyboardEvent;
    const items = this.getSelectItems();

    switch (key) {
      case 'ArrowDown':
        this.navigateItems(1, items);
        break;
      case 'ArrowUp':
        this.navigateItems(-1, items);
        break;
      case 'Enter':
      case ' ':
        this.selectFocusedItem(items);
        break;
      case 'Escape':
        this.close();
        this.focusButton();
        break;
      case 'Home':
        this.focusFirstItem(items);
        break;
      case 'End':
        this.focusLastItem(items);
        break;
    }
  }

  toggle() {
    if (this.arcDisabled()) {
      return;
    }

    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  selectItem(value: string, label: string) {
    if (value === undefined || value === null || value === '') {
      console.warn('Attempted to select item with invalid value:', { value, label });
      return;
    }

    this.arcValue.update((selectedValues) => {
      if (Array.isArray(selectedValues)) {
        return selectedValues.includes(value)
          ? selectedValues.filter((v) => v !== value)
          : [...selectedValues, value];
      }

      return value;
    });
    this.onChange(value);
    this.arcSelectionChange.emit(this.arcValue());

    if (this.arcMultiple()) {
      // in multiple mode it can happen that button changes size because of selection badges,
      // which requires overlay position to update
      this.updateOverlayPosition();
    } else {
      this.close();

      // Return focus to the button after selection
      setTimeout(() => {
        this.focusButton();
      }, 0);
    }
  }

  private navigateTo(element: ArcTechSelectItemComponent, index: number): void {
    this.focusedIndex.set(index);
    this.updateItemFocus(this.getSelectItems(true), index);
  }

  private updateOverlayPosition(): void {
    setTimeout(() => {
      this.overlayRef?.updatePosition();
    }, 0);
  }

  private provideLabelsForMultiselectMode(selectedValue: string[]): string[] {
    const labelsToShowCount = selectedValue.length - this.arcMaxLabelCount();
    const labels = [];
    let index = 0;
    for (const value of selectedValue) {
      const matchingItem = this.getMatchingItem(value);
      if (matchingItem) {
        labels.push(matchingItem.label());
        index++;
      }
      if (labelsToShowCount && this.arcMaxLabelCount() && index === this.arcMaxLabelCount()) {
        labels.push(`${labelsToShowCount} more item${labelsToShowCount > 1 ? 's' : ''} selected`);
        break;
      }
    }
    return labels;
  }

  private syncSelectItems(): void {
    const items = this.selectItems();
    const hostWidth = this.elementRef.nativeElement.offsetWidth || 0;
    const shouldUseCompactMode = hostWidth > 0 && hostWidth <= COMPACT_MODE_WIDTH_THRESHOLD;

    this.isCompact.set(shouldUseCompactMode);

    items.forEach((item, index) => {
      item.setSelectHost({
        selectedValue: () =>
          this.arcMultiple() ? (this.arcValue() as string[]) : [this.arcValue() as string],
        selectItem: (value: string, label: string) => this.selectItem(value, label),
        navigateTo: () => this.navigateTo(item, index),
      });
      item.arcSize.set(this.arcSize());
      item.arcMode.set(shouldUseCompactMode ? 'compact' : 'normal');
    });
  }

  private syncAccessibilityBindings(): void {
    const hostElement = this.elementRef.nativeElement;
    const hostId = hostElement.getAttribute('id')?.trim();

    if (hostId) {
      this.triggerIdValue.set(`${hostId}-trigger`);
      this.popupIdValue.set(`${hostId}-listbox`);
    }

    this.hostAriaLabel.set(hostElement.getAttribute('aria-label'));
    this.externalLabelId.set(this.findExternalLabelId(hostId));
  }

  private provideLabelForSingleSelectMode(selectedValue: string): string[] {
    const manualLabel = this.arcLabel();
    if (manualLabel) {
      return [manualLabel];
    }

    const matchingItem = this.getMatchingItem(selectedValue);
    if (matchingItem) {
      return [matchingItem.label()];
    }

    return selectedValue ? [selectedValue] : [];
  }

  private open() {
    if (this.isOpen()) {
      return;
    }

    // Options can be projected asynchronously (e.g. after API data loads).
    // Re-sync item host bindings right before opening.
    this.syncSelectItems();

    // Create overlay if it doesn't exist
    if (!this.overlayRef) {
      this.createOverlay();
    }

    if (!this.overlayRef) {
      return;
    }

    const hostWidth = this.elementRef.nativeElement.offsetWidth || 0;

    if (this.overlayRef.hasAttached()) {
      this.overlayRef.detach();
    }

    this.portal = new TemplatePortal(this.dropdownTemplate(), this.viewContainerRef);

    this.overlayRef.attach(this.portal);
    this.overlayRef.updateSize({ width: hostWidth });
    this.isOpen.set(true);
    this.updateFocusWhenNormalMode();

    this.determinePortalWidthOnOpen(hostWidth);
  }

  private setFocusOnOpen(): void {
    this.focusDropdown();
    this.focusSelectedItem();
  }

  private close() {
    if (this.overlayRef?.hasAttached()) {
      this.overlayRef.detach();
    }
    this.isOpen.set(false);
    this.focusedIndex.set(-1);
    this.onTouched();
    this.updateFocusWhenNormalMode();
  }

  private updateFocusWhenNormalMode(): void {
    if (!this.isCompact()) {
      // In normal mode the trigger should look active only while the dropdown is open.
      this.isFocus.set(this.isOpen());
    }
  }

  private getMatchingItem(value: string): ArcTechSelectItemComponent | undefined {
    return this.selectItems()?.find((item) => item.arcValue() === value);
  }

  private isRegisteredIcon(value: string): value is keyof typeof ARCTECH_ICONS {
    return Object.hasOwn(ARCTECH_ICONS, value);
  }

  private determinePortalWidthOnOpen(portalWidth: number): void {
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        if (!this.overlayRef || !this.overlayRef.hasAttached()) {
          return;
        }

        const overlayPaneElement = this.overlayRef.overlayElement;
        const textElements = Array.from(
          overlayPaneElement.querySelectorAll<HTMLElement>(
            'arc-select-item > span.truncate, [arc-select-item] > span.truncate',
          ),
        );
        let isOverflow = false;
        for (const textElement of textElements) {
          if (textElement.scrollWidth > textElement.clientWidth + 1) {
            isOverflow = true;
            break;
          }
        }

        if (!isOverflow) {
          this.setFocusOnOpen();
          return;
        }

        const selectItems = this.selectItems();
        let itemMaxWidth = 0;
        for (const item of selectItems) {
          itemMaxWidth = Math.max(itemMaxWidth, item.elementRef.nativeElement.scrollWidth);
        }

        const [selectItem] = selectItems;
        if (isOverflow && selectItem) {
          const elementStyles = getComputedStyle(selectItem.elementRef.nativeElement);
          const leftPadding =
            Number.parseFloat(elementStyles.getPropertyValue('padding-left')) || 0;
          const rightPadding =
            Number.parseFloat(elementStyles.getPropertyValue('padding-right')) || 0;
          itemMaxWidth += leftPadding + rightPadding;
        }

        itemMaxWidth = Math.max(itemMaxWidth, portalWidth);
        this.overlayRef.updateSize({ width: itemMaxWidth });
        this.overlayRef.updatePosition();

        this.setFocusOnOpen();
      });
    });
  }

  private createOverlay() {
    if (this.overlayRef) {
      return;
    } // Already created

    if (isPlatformBrowser(this.platformId)) {
      try {
        const positionStrategy = this.overlayPositionBuilder
          .flexibleConnectedTo(this.elementRef)
          .withPositions([
            {
              originX: 'center',
              originY: 'bottom',
              overlayX: 'center',
              overlayY: 'top',
              offsetY: 4,
            },
            {
              originX: 'center',
              originY: 'top',
              overlayX: 'center',
              overlayY: 'bottom',
              offsetY: -4,
            },
          ])
          .withPush(false);

        const elementWidth = this.elementRef.nativeElement.offsetWidth || 200;

        this.overlayRef = this.overlay.create({
          positionStrategy,
          hasBackdrop: false,
          scrollStrategy: this.overlay.scrollStrategies.reposition(),
          width: elementWidth,
          maxHeight: 384, // max-h-96 equivalent
        });
        this.overlayRef
          .outsidePointerEvents()
          .pipe(
            filter((event) => !this.elementRef.nativeElement.contains(event.target)),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(() => {
            this.isFocus.set(false);
            this.close();
          });
      } catch (error) {
        console.error('Error creating overlay:', error);
      }
    }
  }

  private destroyOverlay() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
    }
  }

  private getSelectItems(ignoreFilter = false): HTMLElement[] {
    if (!this.overlayRef?.hasAttached()) {
      return [];
    }
    const dropdownElement = this.overlayRef.overlayElement;
    return Array.from(
      dropdownElement.querySelectorAll<HTMLElement>('arc-select-item, [arc-select-item]'),
    ).filter((item) => ignoreFilter || item.dataset['disabled'] === undefined);
  }

  private navigateItems(direction: number, items: HTMLElement[]) {
    if (items.length === 0) {
      return;
    }

    const currentIndex = this.focusedIndex();
    let nextIndex = currentIndex + direction;

    if (nextIndex < 0) {
      nextIndex = items.length - 1;
    } else if (nextIndex >= items.length) {
      nextIndex = 0;
    }

    this.focusedIndex.set(nextIndex);
    this.updateItemFocus(items, nextIndex);
  }

  private selectFocusedItem(items: HTMLElement[]) {
    const currentIndex = this.focusedIndex();
    if (currentIndex >= 0 && currentIndex < items.length) {
      const item = items[currentIndex];
      const value = item.getAttribute('value');
      const label = item.textContent?.trim() ?? '';

      if (value === null || value === undefined) {
        console.warn('No value attribute found on selected item:', item);
        return;
      }

      this.selectItem(value, label);
    }
  }

  private focusFirstItem(items: HTMLElement[]) {
    if (items.length > 0) {
      this.focusedIndex.set(0);
      this.updateItemFocus(items, 0);
    }
  }

  private focusLastItem(items: HTMLElement[]) {
    if (items.length > 0) {
      const lastIndex = items.length - 1;
      this.focusedIndex.set(lastIndex);
      this.updateItemFocus(items, lastIndex);
    }
  }

  private updateItemFocus(items: HTMLElement[], focusedIndex: number) {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (index === focusedIndex) {
        item.setAttribute('tabindex', '0');
        item.setAttribute('data-focused', 'true');
        item.focus();
      } else {
        item.setAttribute('tabindex', '-1');
        item.removeAttribute('data-focused');
      }
    }
  }

  private focusDropdown() {
    if (this.overlayRef?.hasAttached()) {
      const dropdownElement = this.overlayRef.overlayElement.querySelector(
        '[role="listbox"]',
      ) as HTMLElement;
      if (dropdownElement) {
        dropdownElement.focus();
      }
    }
  }

  private focusButton() {
    this.triggerButton().nativeElement.focus();
  }

  private focusSelectedItem() {
    const items = this.getSelectItems();
    if (items.length === 0) {
      return;
    }

    // Find the index of the currently selected item
    let selectedValue;
    if (Array.isArray(this.arcValue()) && this.arcValue().length) {
      [selectedValue] = this.arcValue();
    } else {
      selectedValue = this.arcValue();
    }

    let selectedIndex = items.findIndex((item) => item.getAttribute('value') === selectedValue);

    // If no item is selected, focus the first item
    if (selectedIndex === -1) {
      selectedIndex = 0;
    }

    this.focusedIndex.set(selectedIndex);
    this.updateItemFocus(items, selectedIndex);
  }

  // ControlValueAccessor implementation
  writeValue(value: string | string[] | null): void {
    if (this.arcMultiple() && Array.isArray(value)) {
      this.arcValue.set(value);
    } else {
      this.arcValue.set(value ?? '');
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(): void {
    // The disabled state is handled by the disabled input
  }

  private findExternalLabelId(hostId?: string): string | null {
    if (!hostId || !isPlatformBrowser(this.platformId)) {
      return null;
    }

    const matchingLabel = Array.from(document.querySelectorAll('label')).find(
      (label) => label.htmlFor === hostId,
    );
    if (!matchingLabel) {
      return null;
    }

    if (!matchingLabel.id) {
      matchingLabel.id = `${hostId}-label`;
    }

    return matchingLabel.id;
  }
}
