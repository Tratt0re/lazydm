import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  output,
  runInInjectionContext,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent, type ArcTechButtonTypeVariants } from '@/shared/components/button';
import { ArcTechIdDirective } from '@/shared/core';
import { comboboxVariants, type ArcTechComboboxWidthVariants } from '@/shared/components/combobox/combobox.variants';
import {
  ArcTechCommandComponent,
  ArcTechCommandEmptyComponent,
  ArcTechCommandInputComponent,
  ArcTechCommandListComponent,
  ArcTechCommandOptionComponent,
  ArcTechCommandOptionGroupComponent,
  type ArcTechCommandOption,
} from '@/shared/components/command';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechPopoverComponent, ArcTechPopoverDirective } from '@/shared/components/popover';
import { mergeClasses } from '@/shared/utils/merge-classes';

export interface ArcTechComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: ArcTechIcon;
  /** Muted second line under the label, also searched (a file path, for notes that share a name). */
  description?: string;
}

export interface ArcTechComboboxGroup {
  label?: string;
  options: ArcTechComboboxOption[];
}

@Component({
  selector: 'arc-combobox',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    ArcTechBadgeComponent,
    ArcTechButtonComponent,
    ArcTechCommandComponent,
    ArcTechCommandInputComponent,
    ArcTechCommandListComponent,
    ArcTechCommandEmptyComponent,
    ArcTechCommandOptionComponent,
    ArcTechCommandOptionGroupComponent,
    ArcTechPopoverDirective,
    ArcTechPopoverComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechIdDirective,
  ],
  template: `
    <button
      type="button"
      arc-button
      arcPopover
      arcTechId="combobox"
      #z="arcTechId"
      role="combobox"
      [id]="arcId() || z.id()"
      [arcContent]="popoverContent"
      [arcType]="buttonVariant()"
      [class]="buttonClasses()"
      [arcDisabled]="disabled()"
      [attr.aria-expanded]="open()"
      [attr.aria-haspopup]="'listbox'"
      [attr.aria-controls]="'combobox-listbox'"
      [attr.aria-label]="ariaLabel() || 'Select option'"
      [attr.aria-describedby]="ariaDescribedBy()"
      [attr.aria-autocomplete]="searchable() ? 'list' : 'none'"
      [attr.aria-activedescendant]="null"
      (arcVisibleChange)="setOpen($event)"
      #popoverTrigger
    >
      <span [class]="valueContainerClasses()">
        @if (multiple()) {
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            @for (label of displayLabels(); track $index) {
              <arc-badge arcType="secondary" class="max-w-[120px] truncate">
                <span class="truncate">{{ label }}</span>
              </arc-badge>
            } @empty {
              <span class="text-muted-foreground truncate">{{ placeholder() }}</span>
            }
          </span>
        } @else {
          @if (selectedOption(); as selectedOption) {
            @if (selectedOption.icon; as selectedIcon) {
              <arc-icon arcSize="sm" [arcType]="selectedIcon" class="shrink-0 text-primary opacity-70" />
            }
          }
          <span class="truncate">{{ displayValue() ?? placeholder() }}</span>
        }
      </span>
      <arc-icon arcType="chevrons-up-down" [class]="chevronClasses()" />
    </button>

    <ng-template #popoverContent>
      <arc-popover [class]="popoverClasses()">
        <arc-command class="min-h-auto" (arcCommandSelected)="handleSelect($event)" #commandRef>
          @if (searchable()) {
            <arc-command-input [placeholder]="searchPlaceholder()" #commandInputRef />
          }

          <arc-command-list id="combobox-listbox" role="listbox" [attr.aria-multiselectable]="multiple() ? 'true' : null">
            @if (emptyText()) {
              <arc-command-empty>
                <arc-empty [arcDescription]="emptyText()" />
              </arc-command-empty>
            }

            @for (group of groups(); track group.label ?? $index) {
              @if (group.label) {
                <arc-command-option-group [arcLabel]="group.label" #commandGroup>
                  @for (option of group.options; track option.value) {
                    <ng-container
                      [ngTemplateOutlet]="commandOption"
                      [ngTemplateOutletContext]="{
                        $implicit: option,
                        commandInstance: commandRef,
                        groupInstance: commandGroup,
                      }"
                    />
                  }
                </arc-command-option-group>
              } @else {
                @for (option of group.options; track option.value) {
                  <ng-container
                    [ngTemplateOutlet]="commandOption"
                    [ngTemplateOutletContext]="{
                      $implicit: option,
                      commandInstance: commandRef,
                    }"
                  />
                }
              }
            } @empty {
              @if (options().length > 0) {
                @for (option of options(); track option.value) {
                  <ng-container
                    [ngTemplateOutlet]="commandOption"
                    [ngTemplateOutletContext]="{
                      $implicit: option,
                      commandInstance: commandRef,
                    }"
                  />
                }
              }
            }
          </arc-command-list>
        </arc-command>
      </arc-popover>
    </ng-template>

    <ng-template #commandOption let-option let-cmd="commandInstance" let-grp="groupInstance">
      <arc-command-option
        [arcValue]="option.value"
        [arcLabel]="option.label"
        [arcDescription]="option.description ?? ''"
        [arcDisabled]="option.disabled ?? false"
        [arcIcon]="option.icon"
        [arcSelected]="isOptionSelected(option.value)"
        [arcShowSelectedIndicator]="multiple()"
        [parentCommand]="cmd"
        [commandGroup]="grp"
      />
    </ng-template>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechComboboxComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '(document:keydown.escape)': 'onDocumentKeyDown($event)',
    '(keydown.escape.prevent-with-stop)': 'onKeyDownEscape()',
    '(keydown.{arrowdown,arrowup,enter,home,end,pageup,pagedown,space}.prevent)': 'onKeyDown($event)',
    '(keydown.tab)': 'onKeyDown($event)',
  },
  exportAs: 'arcCombobox',
})
export class ArcTechComboboxComponent implements ControlValueAccessor {
  private readonly injector = inject(Injector);

  readonly arcId = input<string>('');
  readonly class = input<ClassValue>('');
  readonly buttonVariant = input<ArcTechButtonTypeVariants>('outline');
  readonly arcButtonClass = input<ClassValue>('');
  readonly arcChevronClass = input<ClassValue>('opacity-50');
  readonly arcWidth = input<ArcTechComboboxWidthVariants>('default');
  readonly placeholder = input<string>('Select...');
  readonly searchPlaceholder = input<string>('Search...');
  readonly emptyText = input<string>('No results found.');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly searchable = input(true, { transform: booleanAttribute });
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly maxLabelCount = input(1);
  readonly value = input<string | readonly string[] | null | undefined>(undefined);
  readonly options = input<ArcTechComboboxOption[]>([]);
  readonly groups = input<ArcTechComboboxGroup[]>([]);
  readonly ariaLabel = input<string>('');
  readonly ariaDescribedBy = input<string>('');

  readonly arcValueChange = output<string | string[] | null>();
  readonly arcComboSelected = output<ArcTechComboboxOption>();

  readonly popoverDirective = viewChild.required('popoverTrigger', { read: ArcTechPopoverDirective });
  readonly buttonRef = viewChild.required('popoverTrigger', { read: ElementRef });
  readonly commandRef = viewChild('commandRef', { read: ArcTechCommandComponent });
  readonly commandInputRef = viewChild('commandInputRef', { read: ArcTechCommandInputComponent });

  protected readonly open = signal(false);
  protected readonly internalValue = signal<string | readonly string[] | null>(null);

  protected readonly classes = computed(() =>
    mergeClasses(
      comboboxVariants({
        arcWidth: this.arcWidth(),
      }),
      this.class(),
    ),
  );

  protected readonly buttonClasses = computed(() =>
    mergeClasses(
      'w-full justify-between',
      this.multiple() ? 'h-auto min-h-9 py-1.5' : '',
      this.arcButtonClass(),
    ),
  );
  protected readonly valueContainerClasses = computed(() =>
    mergeClasses('min-w-0 flex-1 text-left', this.multiple() ? '' : 'flex items-center gap-2'),
  );
  protected readonly chevronClasses = computed(() => mergeClasses('ml-2 shrink-0', this.arcChevronClass()));

  protected readonly popoverClasses = computed(() => {
    const widthClass = this.arcWidth() === 'full' ? 'w-full' : comboboxVariants({ arcWidth: this.arcWidth() });
    return `${widthClass} p-0`;
  });

  protected readonly currentValue = computed<string | readonly string[] | null>(() => {
    const controlledValue = this.value();
    return controlledValue !== undefined ? controlledValue : this.internalValue();
  });
  protected readonly selectedOption = computed(() => {
    if (this.multiple()) {
      return null;
    }

    const currentValue = this.currentValue();
    if (typeof currentValue !== 'string' || currentValue.length === 0) {
      return null;
    }

    return this.getOptionByValue(currentValue);
  });

  protected readonly displayValue = computed(() => {
    return this.selectedOption()?.label ?? null;
  });
  protected readonly selectedValues = computed<string[]>(() => {
    if (!this.multiple()) {
      return [];
    }

    const currentValue = this.currentValue();
    if (Array.isArray(currentValue)) {
      return currentValue.filter((value) => typeof value === 'string' && value.trim().length > 0);
    }

    if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
      return [currentValue];
    }

    return [];
  });
  protected readonly displayLabels = computed<string[]>(() => {
    const selectedValues = this.selectedValues();
    const labels = selectedValues.map((value) => this.getOptionByValue(value)?.label ?? value);
    const maxLabelCount = Math.max(0, this.maxLabelCount());

    if (maxLabelCount <= 0 || labels.length <= maxLabelCount) {
      return labels;
    }

    const hiddenCount = labels.length - maxLabelCount;
    return [...labels.slice(0, maxLabelCount), `${hiddenCount} more`];
  });

  private onChange: (value: string | string[] | null) => void = () => {
    // ControlValueAccessor implementation
  };

  private onTouched: () => void = () => {
    // ControlValueAccessor implementation
  };

  setOpen(open: boolean) {
    this.open.set(open);
    if (open) {
      runInInjectionContext(this.injector, () =>
        afterNextRender(() => {
          const commandRef = this.commandRef();
          if (commandRef) {
            // Refresh options to ensure they're detected
            commandRef.refreshOptions();
            // Focus on search input if searchable, otherwise on command component
            if (this.searchable()) {
              this.commandInputRef()?.focus();
            } else {
              commandRef.focus();
            }
          }
        }),
      );
    }
  }

  handleSelect(commandOption: ArcTechCommandOption) {
    const selectedValue = commandOption.value as string;

    if (this.multiple()) {
      const selectedValues = this.selectedValues();
      const alreadySelected = selectedValues.includes(selectedValue);
      const nextValues = alreadySelected
        ? selectedValues.filter((value) => value !== selectedValue)
        : [...selectedValues, selectedValue];

      this.internalValue.set(nextValues);
      this.onChange(nextValues);
      this.arcValueChange.emit(nextValues);

      const selectedOption = this.getOptionByValue(selectedValue);
      if (selectedOption && !alreadySelected) {
        this.arcComboSelected.emit(selectedOption);
      }

      return;
    }

    // Toggle behavior - if same value is selected, clear it
    const currentValue = this.currentValue();
    const newValue = selectedValue === currentValue ? null : selectedValue;

    this.internalValue.set(newValue);
    this.onChange(newValue);
    this.arcValueChange.emit(newValue);

    // Emit the combobox option if we have a selection
    if (newValue) {
      const selectedOption = this.getOptionByValue(newValue);
      if (selectedOption) {
        this.arcComboSelected.emit(selectedOption);
      }
    }

    // Close the popover
    this.popoverDirective().hide();

    // Return focus to the combobox button after selection
    this.buttonRef().nativeElement.focus();
  }

  onKeyDownEscape(): void {
    if (this.open()) {
      this.popoverDirective().hide();
      this.buttonRef().nativeElement.focus();
      return;
    }

    if (this.multiple()) {
      if (this.selectedValues().length > 0) {
        this.internalValue.set([]);
        this.onChange([]);
        this.arcValueChange.emit([]);
      }
      return;
    }

    if (this.currentValue()) {
      this.internalValue.set(null);
      this.onChange(null);
      this.arcValueChange.emit(null);
    }
  }

  onKeyDown(e: Event) {
    if (this.disabled()) {
      return;
    }

    const { key, ctrlKey, altKey, metaKey } = e as KeyboardEvent;

    // Handle different keyboard events based on combobox state
    if (this.open()) {
      // When popover is open
      switch (key) {
        case 'Tab':
          // Allow tab to close and move to next element
          this.popoverDirective().hide();
          break;
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case 'Home':
        case 'End':
        case 'PageUp':
        case 'PageDown':
          // Forward navigation to command component
          this.commandRef()?.onKeyDown(e as KeyboardEvent);
          break;
      }
    } else {
      // When popover is closed
      switch (key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case ' ': // Space key
          this.popoverDirective().show();
          break;
        default:
          // For searchable comboboxes, open and start typing
          if (this.searchable() && key.length === 1 && !ctrlKey && !altKey && !metaKey) {
            this.popoverDirective().show();
            // Let the command input handle the character after opening
            runInInjectionContext(this.injector, () =>
              afterNextRender(() => {
                const inputElement = this.commandInputRef();
                if (inputElement) {
                  inputElement.searchInput().nativeElement.value = key;
                  inputElement.updateParentComponents(key);
                  inputElement.focus();
                }
              }),
            );
          }
          break;
      }
    }
  }

  // needed when component loses focus by keyboard.
  onDocumentKeyDown(event: Event) {
    // Close on Escape from anywhere when this combobox is open
    if (this.open()) {
      const target = event.target as Element;
      const buttonElement = this.buttonRef().nativeElement;
      // Only handle if not already handled by the component itself
      if (!buttonElement.contains(target)) {
        this.popoverDirective().hide();
        this.buttonRef().nativeElement.focus();
      }
    }
  }

  protected isOptionSelected(value: string): boolean {
    if (this.multiple()) {
      return this.selectedValues().includes(value);
    }

    return this.currentValue() === value;
  }

  // ControlValueAccessor implementation
  writeValue(value: string | readonly string[] | null): void {
    this.internalValue.set(value);
  }

  registerOnChange(fn: (value: string | string[] | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  private getOptionByValue(value: string): ArcTechComboboxOption | null {
    if (this.groups().length > 0) {
      for (const group of this.groups()) {
        const option = group.options.find(opt => opt.value === value);
        if (option) {
          return option;
        }
      }
    }

    return this.options().find(opt => opt.value === value) ?? null;
  }
}
