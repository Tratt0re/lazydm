import { describe, expect, it } from 'vitest';

import { toDisplayPath } from './vault-path';

describe('toDisplayPath', () => {
  it('drops the campaign folder', () => {
    expect(toDisplayPath('lost-mine/scene/capitolo-1/goblin.md')).toBe(
      'scene/capitolo-1/goblin.md',
    );
    expect(toDisplayPath('lost-mine/npcs/elder.md')).toBe('npcs/elder.md');
  });

  it('keeps the compendium system, which tells it apart from a campaign', () => {
    expect(toDisplayPath('compendium/dnd-5e/notes/goblin.md')).toBe(
      'compendium/dnd-5e/notes/goblin.md',
    );
  });

  it('leaves a path with a single segment alone', () => {
    expect(toDisplayPath('campaign.md')).toBe('campaign.md');
  });
});
