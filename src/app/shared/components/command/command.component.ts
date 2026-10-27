import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  forwardRef,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ArcTechCommandInputComponent } from '@/shared/components/command/command-input.component';
import { ArcTechCommandOptionComponent } from '@/shared/components/command/command-option.component';
import { commandVariants, type ArcTechCommandSizeVariants } from '@/shared/components/command/command.variants';
import type { ArcTechIcon } from '@/shared/components/icon';
import { mergeClasses } from '@/shared/utils/merge-classes';

export interface ArcTechCommandOption {
  value: unknown;
  label: string;
  disabled?: boolean;
  command?: string;
  shortcut?: string;
  icon?: ArcTechIcon;
  action?: () => void;
  key?: string; // Keyboard shortcut key (e.g., 'n' for Ctrl+N)
}

export interface ArcTechCommandGroup {
  label: string;
  options: ArcTechCommandOption[];
}

export interface ArcTechCommandConfig {
  placeholder?: string;
  emptyText?: string;
  groups: ArcTechCommandGroup[];
  dividers?: boolean;
  onSelect?: (option: ArcTechCommandOption) => void;
}

export abstract class ArcTechCommand {
  abstract registerOption(option: ArcTechCommandOptionComponent): void;
  abstract unregisterOption(option: ArcTechCommandOptionComponent): void;
}

@Component({
  selector: 'arc-command',
  imports: [FormsModule],
  template: `
    <div [class]="classes()">
      <div id="command-instructions" class="sr-only">
        Use arrow keys to navigate, Enter to select, Escape to clear selection.
      </div>
      <div id="command-status" class="sr-only" aria-live="polite" aria-atomic="true">
        {{ statusMessage() }}
      </div>
      <ng-content />
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechCommandComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    role: 'combobox',
    'aria-haspopup': 'listbox',
    '[attr.aria-expanded]': 'true',
    '(keydown.{arrowdown,arrowup,enter,escape}.prevent)': 'onKeyDown($event)',
  },
  exportAs: 'arcCommand',
})
export class ArcTechCommandComponent implements ControlValueAccessor, ArcTechCommand {
  private readonly commandInput = contentChild(ArcTechCommandInputComponent);
  private readonly optionComponentsAsChildren = contentChildren(ArcTechCommandOptionComponent, { descendants: true });
  private readonly registeredOptionComponents = signal<ArcTechCommandOptionComponent[]>([]);

  readonly size = input<ArcTechCommandSizeVariants>('default');
  readonly class = input<ClassValue>('');

  readonly arcCommandChange = output<ArcTechCommandOption>();
  readonly arcCommandSelected = output<ArcTechCommandOption>();

  // Internal signals for search functionality
  readonly searchTerm = signal('');
  readonly selectedIndex = signal(-1);

  protected readonly optionComponents = computed(() =>
    this.optionComponentsAsChildren().length ? this.optionComponentsAsChildren() : this.registeredOptionComponents(),
  );

  registerOption(option: ArcTechCommandOptionComponent) {
    this.registeredOptionComponents.update(current => [...current, option]);
  }

  unregisterOption(option: ArcTechCommandOptionComponent) {
    this.registeredOptionComponents.update(current => current.filter(o => o !== option));
  }

  // Signal to trigger updates when optionComponents change
  private readonly optionsUpdateTrigger = signal(0);

  protected readonly classes = computed(() => mergeClasses(commandVariants({ size: this.size() }), this.class()));

  // Computed signal for filtered options - this will automatically update when searchTerm or options change
  readonly filteredOptions = computed(() => {
    const searchTerm = this.searchTerm();
    // Include the trigger signal to make this computed reactive to option changes
    this.optionsUpdateTrigger();

    if (!this.optionComponents()) {
      return [];
    }

    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    if (!lowerSearchTerm) {
      return this.optionComponents();
    }

    return this.optionComponents().filter(option => {
      const label = option.arcLabel().toLowerCase();
      const command = option.arcCommand()?.toLowerCase() ?? '';
      const description = option.arcDescription()?.toLowerCase() ?? '';
      return (
        label.includes(lowerSearchTerm) ||
        command.includes(lowerSearchTerm) ||
        description.includes(lowerSearchTerm)
      );
    });
  });

  // Status message for screen readers
  protected readonly statusMessage = computed(() => {
    const searchTerm = this.searchTerm().trim();
    const filteredCount = this.filteredOptions().length;

    if (!searchTerm) {
      return searchTerm;
    }

    if (!filteredCount) {
      return `No results found for "${searchTerm}"`;
    }

    return `${filteredCount} result${filteredCount === 1 ? '' : 's'} found for "${searchTerm}"`;
  });

  private onChange = (_value: unknown) => {
    // ControlValueAccessor implementation
  };

  private onTouched = () => {
    // ControlValueAccessor implementation
  };

  constructor() {
    this.triggerOptionsUpdate();
  }

  /**
   * Trigger an update to the filteredOptions computed signal
   */
  private triggerOptionsUpdate(): void {
    this.optionsUpdateTrigger.update(value => value + 1);
  }

  onSearch(searchTerm: string) {
    this.searchTerm.set(searchTerm);
    this.selectedIndex.set(-1);
    this.updateSelectedOption();
  }

  selectOption(option: ArcTechCommandOptionComponent) {
    const commandOption: ArcTechCommandOption = {
      value: option.arcValue(),
      label: option.arcLabel(),
      disabled: option.arcDisabled(),
      command: option.arcCommand(),
      shortcut: option.arcShortcut(),
      icon: option.arcIcon(),
    };

    this.onChange(commandOption.value);
    this.arcCommandChange.emit(commandOption);
    this.arcCommandSelected.emit(commandOption);
  }

  // in @Component host: '(keydown)': 'onKeyDown($event)'
  onKeyDown(event: Event) {
    const filteredOptions = this.filteredOptions();
    if (filteredOptions.length === 0) {
      return;
    }

    const { key } = event as KeyboardEvent;

    const currentIndex = this.selectedIndex();

    switch (key) {
      case 'ArrowDown': {
        const nextIndex = currentIndex < filteredOptions.length - 1 ? currentIndex + 1 : 0;
        this.selectedIndex.set(nextIndex);
        this.updateSelectedOption();
        break;
      }

      case 'ArrowUp': {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredOptions.length - 1;
        this.selectedIndex.set(prevIndex);
        this.updateSelectedOption();
        break;
      }

      case 'Enter':
        if (currentIndex >= 0 && currentIndex < filteredOptions.length) {
          const selectedOption = filteredOptions[currentIndex];
          if (!selectedOption.arcDisabled()) {
            this.selectOption(selectedOption);
          }
        }
        break;

      case 'Escape':
        this.selectedIndex.set(-1);
        this.updateSelectedOption();
        break;
    }
  }

  private updateSelectedOption() {
    const filteredOptions = this.filteredOptions();
    const selectedIndex = this.selectedIndex();

    // Clear previous selection
    for (const option of filteredOptions) {
      option.setSelected(false);
    }

    // Set new selection
    if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) {
      const selectedOption = filteredOptions[selectedIndex];
      selectedOption.setSelected(true);
      selectedOption.focus();
    }
  }

  // ControlValueAccessor implementation
  writeValue(_value: unknown): void {
    // Implementation if needed for form control integration
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(_isDisabled: boolean): void {
    // Implementation if needed for form control disabled state
  }

  /**
   * Refresh the options list - useful when options are added/removed dynamically
   */
  refreshOptions(): void {
    this.triggerOptionsUpdate();
  }

  /**
   * Focus the command input
   */
  focus(): void {
    this.commandInput()?.focus();
  }
}
