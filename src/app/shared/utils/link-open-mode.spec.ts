import { describe, expect, it } from 'vitest';

import { getLinkOpenMode } from './link-open-mode';

describe('getLinkOpenMode', () => {
  it('ignores a plain click and a lone Alt', () => {
    expect(getLinkOpenMode({ metaKey: false, ctrlKey: false, altKey: false })).toBeNull();
    expect(getLinkOpenMode({ metaKey: false, ctrlKey: false, altKey: true })).toBeNull();
  });

  it('opens a tab with Cmd or Ctrl', () => {
    expect(getLinkOpenMode({ metaKey: true, ctrlKey: false, altKey: false })).toBe('tab');
    expect(getLinkOpenMode({ metaKey: false, ctrlKey: true, altKey: false })).toBe('tab');
  });

  it('opens the side with Cmd or Ctrl plus Alt', () => {
    expect(getLinkOpenMode({ metaKey: true, ctrlKey: false, altKey: true })).toBe('side');
    expect(getLinkOpenMode({ metaKey: false, ctrlKey: true, altKey: true })).toBe('side');
  });
});
