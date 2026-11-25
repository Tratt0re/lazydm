import { describe, expect, it } from 'vitest';

import {
  SIDE_PANEL_DEFAULT_REM,
  SIDE_PANEL_MIN_CONTENT_REM,
  sidePanelMode,
} from './side-panel.config';

describe('sidePanelMode', () => {
  const edge = (SIDE_PANEL_DEFAULT_REM + SIDE_PANEL_MIN_CONTENT_REM) * 16;

  it('is beside when the pane fits the panel and the content minimum', () => {
    expect(sidePanelMode(edge, SIDE_PANEL_DEFAULT_REM)).toBe('beside');
    expect(sidePanelMode(1400, SIDE_PANEL_DEFAULT_REM)).toBe('beside');
  });

  it('is over as soon as the content would get less than its minimum', () => {
    expect(sidePanelMode(edge - 1, SIDE_PANEL_DEFAULT_REM)).toBe('over');
    expect(sidePanelMode(480, SIDE_PANEL_DEFAULT_REM)).toBe('over');
    expect(sidePanelMode(0, SIDE_PANEL_DEFAULT_REM)).toBe('over');
  });

  it('asks more of the pane for a wider panel', () => {
    expect(sidePanelMode(edge, 30)).toBe('over');
    expect(sidePanelMode((30 + SIDE_PANEL_MIN_CONTENT_REM) * 16, 30)).toBe('beside');
  });

  it('follows the root font size', () => {
    expect(sidePanelMode(edge, SIDE_PANEL_DEFAULT_REM, 20)).toBe('over');
  });
});
