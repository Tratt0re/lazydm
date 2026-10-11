import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import type { ArcTechCommandOptionGroupComponent } from '@/shared/components/command/command-option-group.component';
import { ArcTechCommandComponent } from '@/shared/components/command/command.component';
import {
  commandItemVariants,
  commandShortcutVariants,
  type ArcTechCommandItemVariants,
} from '@/shared/components/command/command.variants';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { mergeClasses, transform } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-command-option',
  imports: [ArcTechIconComponent],
  template: `
    @if (isOptionVisible()) {
      <div
        [class]="classes()"
        [attr.role]="'option'"
        [attr.aria-selected]="isSelected()"
        [attr.data-selected]="isSelected()"
        [attr.data-disabled]="arcDisabled()"
        [attr.tabindex]="0"
        (click)="onClick()"
        (keydown.{enter,space}.prevent)="onClick()"
        (mouseenter)="onMouseEnter()"
      >
        @if (arcIcon()) {
          <div arc-icon [arcType]="arcIcon()!" class="mr-2 flex shrink-0 items-center justify-center"></div>
        }
        <span class="flex-1">{{ arcLabel() }}</span>
        @if (arcShortcut()) {
          <span [class]="shortcutClasses()">{{ arcShortcut() }}</span>
        }
        @if (arcShowSelectedIndicator()) {
          <span class="ml-2 flex size-4 shrink-0 items-center justify-center">
            @if (arcSelected()) {
              <arc-icon arcType="check" class="size-4" />
            }
          </span>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcCommandOption',
})
export class ArcTechCommandOptionComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly parentCommandComponent = inject(ArcTechCommandComponent, { optional: true });

  readonly arcValue = input.required<unknown>();
  readonly arcLabel = input.required<string>();
  readonly arcCommand = input<string>('');
  readonly arcIcon = input<ArcTechIcon>();
  readonly arcShortcut = input<string>('');
  readonly arcDisabled = input(false, { transform });
  readonly arcSelected = input(false, { transform: booleanAttribute });
  readonly arcShowSelectedIndicator = input(false, { transform: booleanAttribute });
  readonly variant = input<ArcTechCommandItemVariants>('default');
  readonly class = input<ClassValue>('');
  readonly parentCommand = input<ArcTechCommandComponent | null>(null);
  readonly commandGroup = input<ArcTechCommandOptionGroupComponent | null>(null);

  readonly isActive = signal(false);
  readonly isSelected = computed(() => this.isActive() || this.arcSelected());

  protected readonly classes = computed(() => {
    const baseClasses = commandItemVariants({ variant: this.variant() });
    const selectedClasses = this.isSelected() ? 'bg-accent text-accent-foreground' : '';
    return mergeClasses(baseClasses, selectedClasses, this.class());
  });

  protected readonly shortcutClasses = computed(() => mergeClasses(commandShortcutVariants()));

  private get commandComponent() {
    let parent = this.parentCommand();
    parent ||= this.parentCommandComponent;
    return parent;
  }

  protected readonly isOptionVisible = computed(() => {
    const parent = this.commandComponent;

    if (!parent) {
      return true;
    }
    /*
      If no search term, show this option, otherwise check
      if this option is included in the filtered list
     */
    return !parent.searchTerm() || parent.filteredOptions().includes(this);
  });

  constructor() {
    effect(onCleanup => {
      const cmd = this.parentCommand();
      const grp = this.commandGroup();

      if (cmd) {
        cmd.registerOption(this);
        onCleanup(() => cmd.unregisterOption(this));
      }

      if (grp) {
        grp.registerOption(this);
        onCleanup(() => grp.unregisterOption(this));
      }
    });
  }

  onClick() {
    if (this.arcDisabled()) {
      return;
    }

    this.commandComponent?.selectOption(this);
  }

  onMouseEnter() {
    if (this.arcDisabled()) {
      return;
    }
    // Visual feedback for hover
  }

  setSelected(selected: boolean) {
    this.isActive.set(selected);
  }

  focus() {
    const element = this.elementRef.nativeElement;
    element.focus();
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
