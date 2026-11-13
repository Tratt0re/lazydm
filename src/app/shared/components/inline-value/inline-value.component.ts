import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import {
  inlineValueButtonVariants,
  inlineValueInputVariants,
  inlineValueMarkerVariants,
} from './inline-value.variants';

export type ArcTechInlineValueType = 'text' | 'number';
/** What a commit hands over: the typed text, a whole number, or null for an emptied field. */
export type ArcTechInlineValue = string | number | null;
export type ArcTechInlineMove = 'up' | 'down';

const WHOLE_NUMBER_PATTERN = /^[+-]?\d{1,9}$/;

/**
 * What a typed text means: null when emptied, a whole number for a `number` field, the trimmed text for a `text`
 * one. `undefined` when it is not valid (the old value stays).
 */
export function parseInlineValue(
  text: string,
  type: ArcTechInlineValueType,
): ArcTechInlineValue | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (type === 'text') {
    return trimmed;
  }

  return WHOLE_NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : undefined;
}

/**
 * A value edited where it is: the projected content at rest, a field while it is typed. Enter or leaving the
 * field saves, Escape cancels, and a text that is not valid keeps the old value (Enter on it marks the field
 * instead of closing it). ArrowUp / ArrowDown save and ask for the same value of the row above or below. Content
 * marked `arcInlineAction` shows next to the field while it is typed, and `setDraft` puts a value in it.
 */
@Component({
  selector: 'arc-inline-value',
  template: `
    @if (isEditing()) {
      <input
        #field
        type="text"
        [class]="inputClasses()"
        [attr.inputmode]="arcType() === 'number' ? 'numeric' : null"
        [attr.aria-label]="arcLabel()"
        [attr.aria-invalid]="isInvalid() ? 'true' : null"
        [placeholder]="arcPlaceholder()"
        [value]="draft()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
      />
      <!-- Buttons next to the field while it is typed (a dice, a reset…). Pressing one must not take the focus
           from the field, or the field would save and close before the click lands. -->
      <span class="ml-1 inline-flex shrink-0 items-center gap-0.5 empty:hidden" (mousedown)="$event.preventDefault()">
        <ng-content select="[arcInlineAction]" />
      </span>
    } @else {
      <button
        type="button"
        [class]="buttonClasses()"
        [disabled]="arcDisabled()"
        [attr.aria-label]="restingLabel()"
        (click)="startEditing()"
      >
        <ng-content />
        @if (arcOverridden()) {
          <span [class]="markerClasses" aria-hidden="true"></span>
          <span class="sr-only">{{ arcOverriddenLabel() }}</span>
        }
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'inline-flex min-w-0 max-w-full',
    '[attr.data-inline-key]': 'arcKey() || null',
    '[attr.data-inline-row]': 'arcRow() || null',
  },
  exportAs: 'arcInlineValue',
})
export class ArcTechInlineValueComponent {
  private readonly injector = inject(Injector);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  /** The value as stored; what is typed starts from it. */
  readonly arcValue = input<string | number | null>(null);
  readonly arcType = input<ArcTechInlineValueType>('text');
  /** Accessible name of the value (the field's label). */
  readonly arcLabel = input('');
  readonly arcPlaceholder = input('');
  readonly arcDisabled = input(false);
  /** The value differs from the one it would show without it: a mark, and `arcOverriddenLabel` for screen readers. */
  readonly arcOverridden = input(false);
  readonly arcOverriddenLabel = input('');
  /** Identify the value inside its row (`ac`) and the row (`entity-1`), for moving to the same value of another row. */
  readonly arcKey = input('');
  readonly arcRow = input('');
  readonly arcInputClass = input<ClassValue>('');
  readonly arcButtonClass = input<ClassValue>('');

  /** A new value, only when it differs from `arcValue`. */
  readonly arcCommit = output<ArcTechInlineValue>();
  readonly arcMove = output<ArcTechInlineMove>();

  protected readonly isEditing = signal(false);
  protected readonly isInvalid = signal(false);
  protected readonly draft = signal('');
  protected readonly markerClasses = inlineValueMarkerVariants();
  /** The editing is over (saved or cancelled): the blur that follows must not save it again. */
  private isSettled = true;
  private text = '';

  protected readonly buttonClasses = computed(() =>
    mergeClasses(inlineValueButtonVariants(), this.arcButtonClass()),
  );
  protected readonly inputClasses = computed(() =>
    mergeClasses(inlineValueInputVariants(), this.arcInputClass()),
  );
  protected readonly restingLabel = computed(() => {
    const value = this.arcValue();
    return `${this.arcLabel()}: ${value === null || value === '' ? '–' : value}`;
  });

  startEditing(): void {
    if (this.arcDisabled() || this.isEditing()) {
      return;
    }

    this.text = String(this.arcValue() ?? '');
    this.draft.set(this.text);
    this.isInvalid.set(false);
    this.isSettled = false;
    this.isEditing.set(true);
    afterNextRender(
      () => {
        const input = this.field()?.nativeElement;
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  /** Puts `text` in the field while it is open (a rolled value, say); Enter or leaving the field saves it. */
  setDraft(text: string): void {
    if (!this.isEditing()) {
      return;
    }

    this.text = text;
    this.draft.set(text);
    this.isInvalid.set(false);
    const input = this.field()?.nativeElement;
    if (input) {
      input.value = text;
      input.focus();
      input.select();
    }
  }

  protected onInput(event: Event): void {
    this.text = (event.target as HTMLInputElement).value;
    this.isInvalid.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) {
      return;
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.commit(true);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        if (this.commit(true)) {
          this.arcMove.emit(event.key === 'ArrowUp' ? 'up' : 'down');
        }
        break;
      default:
        break;
    }
  }

  protected onBlur(): void {
    // A text that is not a value is dropped when the field is left: the old value stays.
    if (!this.isSettled) {
      this.commit(false);
    }
  }

  /** Saves the typed text; false when it is not valid and the field stays open (`keepOpen`) or closes unchanged. */
  private commit(keepOpen: boolean): boolean {
    const value = parseInlineValue(this.text, this.arcType());
    if (value === undefined) {
      if (keepOpen) {
        this.isInvalid.set(true);
      } else {
        this.finish();
      }

      return false;
    }

    this.finish();
    const current = this.arcValue();
    if (String(value ?? '') !== String(current ?? '')) {
      this.arcCommit.emit(value);
    }

    return true;
  }

  private cancel(): void {
    this.finish();
    this.focusValue();
  }

  private finish(): void {
    this.isSettled = true;
    this.isEditing.set(false);
    this.isInvalid.set(false);
  }

  /** Gives the focus back to the value at rest, so the keyboard does not fall to the page. */
  private focusValue(): void {
    afterNextRender(
      () => {
        const host = this.injector.get(ElementRef<HTMLElement>).nativeElement as HTMLElement;
        host.querySelector('button')?.focus();
      },
      { injector: this.injector },
    );
  }
}
