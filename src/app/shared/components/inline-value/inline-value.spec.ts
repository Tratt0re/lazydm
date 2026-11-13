import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  ArcTechInlineValueComponent,
  parseInlineValue,
  type ArcTechInlineMove,
  type ArcTechInlineValue,
} from './inline-value.component';

describe('parseInlineValue', () => {
  it('reads an emptied field as no value', () => {
    expect(parseInlineValue('', 'number')).toBeNull();
    expect(parseInlineValue('   ', 'text')).toBeNull();
  });

  it('keeps the trimmed text of a text field', () => {
    expect(parseInlineValue('  Goblin 3 ', 'text')).toBe('Goblin 3');
    expect(parseInlineValue('12abc', 'text')).toBe('12abc');
  });

  it('reads whole numbers, signed ones included', () => {
    expect(parseInlineValue('15', 'number')).toBe(15);
    expect(parseInlineValue(' -2 ', 'number')).toBe(-2);
    expect(parseInlineValue('+3', 'number')).toBe(3);
    expect(parseInlineValue('0', 'number')).toBe(0);
  });

  it('rejects anything that is not a whole number', () => {
    for (const text of ['1.5', '1,5', 'abc', '12abc', '1e3', '0x10', '--1', '1234567890']) {
      expect(parseInlineValue(text, 'number'), text).toBeUndefined();
    }
  });
});

@Component({
  imports: [ArcTechInlineValueComponent],
  template: `
    <arc-inline-value
      #inline="arcInlineValue"
      arcLabel="AC"
      [arcValue]="value()"
      [arcType]="type()"
      [arcDisabled]="isDisabled()"
      [arcOverridden]="isOverridden()"
      arcOverriddenLabel="Differs from the note"
      (arcCommit)="commits.push($event)"
      (arcMove)="moves.push($event)"
    >
      <span class="shown">{{ value() ?? '–' }}</span>
      <button arcInlineAction type="button" class="action" (click)="inline.setDraft('12')">dice</button>
    </arc-inline-value>
  `,
})
class HostComponent {
  readonly value = signal<string | number | null>(15);
  readonly type = signal<'text' | 'number'>('number');
  readonly isDisabled = signal(false);
  readonly isOverridden = signal(false);
  readonly commits: ArcTechInlineValue[] = [];
  readonly moves: ArcTechInlineMove[] = [];
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const button = () => root.querySelector('button');
  const input = () => root.querySelector('input');
  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const open = async () => {
    button()!.click();
    await flush();
  };
  const type = async (text: string) => {
    const field = input()!;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await flush();
  };
  const press = async (key: string) => {
    input()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await flush();
  };
  return { fixture, host: fixture.componentInstance, root, button, input, open, type, press, flush };
}

describe('ArcTechInlineValueComponent', () => {
  it('shows its content and names the value for a screen reader', () => {
    const { button, root } = setup();

    expect(root.querySelector('.shown')?.textContent).toBe('15');
    expect(button()?.getAttribute('aria-label')).toBe('AC: 15');
    expect(root.querySelector('input')).toBeNull();
  });

  it('turns into a field holding the value', async () => {
    const { open, input } = setup();

    await open();

    expect(input()?.value).toBe('15');
    expect(input()?.getAttribute('aria-label')).toBe('AC');
  });

  it('saves a new value on Enter', async () => {
    const { open, type, press, host, input } = setup();

    await open();
    await type('17');
    await press('Enter');

    expect(host.commits).toEqual([17]);
    expect(input()).toBeNull();
  });

  it('saves on leaving the field', async () => {
    const { open, type, input, host, flush } = setup();

    await open();
    await type('18');
    input()!.dispatchEvent(new Event('blur'));
    await flush();

    expect(host.commits).toEqual([18]);
  });

  it('saves an emptied field as no value', async () => {
    const { open, type, press, host } = setup();

    await open();
    await type('');
    await press('Enter');

    expect(host.commits).toEqual([null]);
  });

  it('says nothing when the value did not change', async () => {
    const { open, press, host } = setup();

    await open();
    await press('Enter');

    expect(host.commits).toEqual([]);
  });

  it('cancels on Escape, and the blur that follows saves nothing', async () => {
    const { open, type, press, host, input, flush } = setup();

    await open();
    await type('99');
    const field = input()!;
    await press('Escape');
    field.dispatchEvent(new Event('blur'));
    await flush();

    expect(host.commits).toEqual([]);
    expect(input()).toBeNull();
  });

  it('keeps the field open and marks it when Enter hits text that is not a number', async () => {
    const { open, type, press, host, input } = setup();

    await open();
    await type('abc');
    await press('Enter');

    expect(host.commits).toEqual([]);
    expect(input()?.getAttribute('aria-invalid')).toBe('true');
  });

  it('drops text that is not a number when the field is left', async () => {
    const { open, type, input, host, flush } = setup();

    await open();
    await type('abc');
    input()!.dispatchEvent(new Event('blur'));
    await flush();

    expect(host.commits).toEqual([]);
    expect(input()).toBeNull();
  });

  it('saves and asks for the row below on ArrowDown, but not for an invalid text', async () => {
    const { open, type, press, host } = setup();

    await open();
    await type('20');
    await press('ArrowDown');
    expect(host.commits).toEqual([20]);
    expect(host.moves).toEqual(['down']);

    host.value.set(20);
    await open();
    await type('x');
    await press('ArrowUp');
    expect(host.moves).toEqual(['down']);
  });

  it('does not open while disabled', async () => {
    const { host, button, flush, input } = setup();

    host.isDisabled.set(true);
    await flush();

    expect(button()?.disabled).toBe(true);
    button()!.click();
    await flush();
    expect(input()).toBeNull();
  });

  it('marks a value that differs from the note, with text for a screen reader', async () => {
    const { host, root, flush } = setup();

    host.isOverridden.set(true);
    await flush();

    expect(root.querySelector('button span[aria-hidden="true"]')).not.toBeNull();
    expect(root.querySelector('.sr-only')?.textContent).toBe('Differs from the note');
  });

  it('shows its actions only while the field is typed', async () => {
    const { open, root } = setup();

    expect(root.querySelector('.action')).toBeNull();
    await open();
    expect(root.querySelector('.action')).not.toBeNull();
  });

  it('does not let an action take the focus from the field', async () => {
    const { open, root } = setup();

    await open();
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    root.querySelector('.action')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('puts a value in the open field, which Enter then saves', async () => {
    const { open, press, root, input, host, flush } = setup();

    await open();
    (root.querySelector('.action') as HTMLButtonElement).click();
    await flush();
    expect(input()?.value).toBe('12');

    await press('Enter');
    expect(host.commits).toEqual([12]);
  });

  it('ignores setDraft while closed', async () => {
    const { fixture, input } = setup();
    const inline = fixture.debugElement.children[0].componentInstance as ArcTechInlineValueComponent;

    inline.setDraft('7');
    fixture.detectChanges();

    expect(input()).toBeNull();
  });

  it('keeps text as text', async () => {
    const { host, open, type, press, flush } = setup();

    host.type.set('text');
    host.value.set('Goblin');
    await flush();
    await open();
    await type('  Goblin 2 ');
    await press('Enter');

    expect(host.commits).toEqual(['Goblin 2']);
  });
});
