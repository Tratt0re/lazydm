import { describe, expect, it } from 'vitest';

import {
  BUTTON_ZOOM_STEP,
  clampLevel,
  easeLevel,
  GRAPH_MAX_LEVEL,
  GRAPH_MIN_LEVEL,
  GRAPH_ZOOM_EASING,
  keyPan,
  keyZoom,
  levelToScale,
  neighbourhood,
  scaleToLevel,
  seedPositions,
  WHEEL_DELTA_MAX,
  wheelLevelDelta,
} from './section-graph.config';

describe('wheelLevelDelta', () => {
  it('zooms in when the wheel goes up and out when it goes down', () => {
    expect(wheelLevelDelta(-100, 0, false)).toBeGreaterThan(0);
    expect(wheelLevelDelta(100, 0, false)).toBeLessThan(0);
    expect(wheelLevelDelta(0, 0, false)).toBeCloseTo(0);
  });

  it('makes a pinch (ctrl + wheel) stronger than a wheel turn', () => {
    expect(Math.abs(wheelLevelDelta(10, 0, true))).toBeGreaterThan(
      Math.abs(wheelLevelDelta(10, 0, false)) * 4,
    );
  });

  it('counts lines and pages bigger than pixels', () => {
    expect(Math.abs(wheelLevelDelta(1, 1, false))).toBeGreaterThan(
      Math.abs(wheelLevelDelta(1, 0, false)),
    );
    expect(Math.abs(wheelLevelDelta(1, 2, false))).toBeGreaterThan(
      Math.abs(wheelLevelDelta(1, 1, false)),
    );
  });

  it('caps a single event so a fast flick cannot jump the whole range', () => {
    expect(wheelLevelDelta(100000, 0, false)).toBeCloseTo(
      wheelLevelDelta(WHEEL_DELTA_MAX, 0, false),
    );
    expect(wheelLevelDelta(-100000, 0, true)).toBeCloseTo(
      wheelLevelDelta(-WHEEL_DELTA_MAX, 0, true),
    );
  });
});

describe('levels and scales', () => {
  it('clamps to the range', () => {
    expect(clampLevel(10)).toBe(GRAPH_MAX_LEVEL);
    expect(clampLevel(-10)).toBe(GRAPH_MIN_LEVEL);
    expect(clampLevel(0.5)).toBe(0.5);
  });

  it('goes back and forth between a level and a scale', () => {
    expect(levelToScale(0)).toBe(1);
    expect(levelToScale(1)).toBe(2);
    expect(levelToScale(-2)).toBe(0.25);
    expect(levelToScale(GRAPH_MIN_LEVEL)).toBe(0.125);
    expect(scaleToLevel(levelToScale(1.3))).toBeCloseTo(1.3);
  });

  it('lets a button press move a good part of a level', () => {
    expect(BUTTON_ZOOM_STEP).toBeGreaterThan(0.5);
    expect(BUTTON_ZOOM_STEP).toBeLessThan(1);
  });
});

describe('easeLevel', () => {
  it('moves a share of the distance each frame and is not done yet', () => {
    const step = easeLevel(0, 1, false);
    expect(step.level).toBeCloseTo(GRAPH_ZOOM_EASING);
    expect(step.done).toBe(false);
  });

  it('arrives: the frames get shorter and end on the target', () => {
    let level = 0;
    let frames = 0;
    for (;;) {
      const step = easeLevel(level, 1, false);
      level = step.level;
      frames += 1;
      if (step.done || frames > 200) {
        break;
      }
    }

    expect(level).toBe(1);
    expect(frames).toBeLessThan(60);
  });

  it('jumps straight to the target when motion is reduced', () => {
    expect(easeLevel(0, 1.5, true)).toEqual({ level: 1.5, done: true });
  });
});

describe('keyPan / keyZoom', () => {
  it('moves the content the other way from the arrow, so the view follows the arrow', () => {
    expect(keyPan('ArrowLeft')?.x).toBeGreaterThan(0);
    expect(keyPan('ArrowRight')?.x).toBeLessThan(0);
    expect(keyPan('ArrowUp')?.y).toBeGreaterThan(0);
    expect(keyPan('ArrowDown')?.y).toBeLessThan(0);
    expect(keyPan('a')).toBeNull();
  });

  it('knows the zoom keys', () => {
    expect(keyZoom('+')).toBe('in');
    expect(keyZoom('=')).toBe('in');
    expect(keyZoom('-')).toBe('out');
    expect(keyZoom('0')).toBe('fit');
    expect(keyZoom('x')).toBeNull();
  });
});

describe('seedPositions', () => {
  it('gives one point per node, the first at the centre', () => {
    const points = seedPositions(5);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(seedPositions(0)).toEqual([]);
  });

  it('is the same every time, so a folder always starts the same way', () => {
    expect(seedPositions(12)).toEqual(seedPositions(12));
  });

  it('does not stack two nodes on one spot', () => {
    const points = seedPositions(40);
    const spots = new Set(points.map((point) => `${point.x},${point.y}`));
    expect(spots.size).toBe(40);
  });
});

describe('neighbourhood', () => {
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'c', target: 'a' },
    { source: 'd', target: 'e' },
  ];

  it('holds the node and whatever it links to or is linked from', () => {
    expect([...neighbourhood(edges, 'a')].sort()).toEqual(['a', 'b', 'c']);
    expect([...neighbourhood(edges, 'e')].sort()).toEqual(['d', 'e']);
  });

  it('holds only the node when it has no links', () => {
    expect([...neighbourhood(edges, 'z')]).toEqual(['z']);
  });
});
