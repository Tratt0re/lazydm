/** Where a side panel goes: beside the content (it takes its room) or over it (a sheet above the content). */
export type SidePanelMode = 'beside' | 'over';

/** Width of a side panel when nothing says otherwise (rem). */
export const SIDE_PANEL_DEFAULT_REM = 21;
/** The room the content keeps when the panel is beside it (rem): under it the content is too cramped to work in. */
export const SIDE_PANEL_MIN_CONTENT_REM = 34;
/** An over-panel never covers the whole pane: this much of the content stays visible (rem). */
export const SIDE_PANEL_OVER_GAP_REM = 3;
/** An over-panel is never wider than this (rem), however wide the pane. */
export const SIDE_PANEL_OVER_MAX_REM = 22;

/**
 * Beside when the pane can give the panel its width and still leave the content its minimum; over otherwise.
 * Measured on the pane (the page's own area), not on the window: a pane is narrower than the window when the
 * sidebar is open or the screen is split.
 */
export function sidePanelMode(
  paneWidthPx: number,
  panelWidthRem: number,
  remPx = 16,
): SidePanelMode {
  return paneWidthPx >= (panelWidthRem + SIDE_PANEL_MIN_CONTENT_REM) * remPx ? 'beside' : 'over';
}
