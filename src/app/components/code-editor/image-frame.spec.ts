import { describe, expect, it } from 'vitest';

import { parseImageEmbed, withImageFrame } from './image-frame';

describe('parseImageEmbed', () => {
  it('reads a plain embed as having no width and no label', () => {
    expect(parseImageEmbed('map.png')).toEqual({
      path: 'map.png',
      frame: { width: null },
      label: null,
    });
  });

  it('reads the width case-insensitively', () => {
    expect(parseImageEmbed('map.png|Wide').frame).toEqual({ width: 'wide' });
  });

  it('keeps the alias text that is not a width as the label', () => {
    const parsed = parseImageEmbed('map.png|The keep|half');
    expect(parsed.label).toBe('The keep');
    expect(parsed.frame.width).toBe('half');
  });
});

describe('withImageFrame', () => {
  it('writes path, label and width, leaving out what is unset', () => {
    expect(withImageFrame('map.png', { width: 'full' })).toBe('map.png|full');
    expect(withImageFrame('map.png|The keep', { width: 'half' })).toBe('map.png|The keep|half');
  });

  it('replaces the width already there and resets to the bare path', () => {
    expect(withImageFrame('map.png|full', { width: 'wide' })).toBe('map.png|wide');
    expect(withImageFrame('map.png|full', { width: null })).toBe('map.png');
  });
});
