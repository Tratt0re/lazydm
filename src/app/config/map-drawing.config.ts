import type { MapDrawingStyleDto } from '@/dtos';
import type { ArcTechIcon } from '@/shared/components/icon';

/** World pixels of one square of the sheet; the same value as the Electron model. */
export const DRAWING_CELL = 40;
export const DRAWING_DEFAULT_COLS = 30;
export const DRAWING_DEFAULT_ROWS = 20;
export const DRAWING_SIZE_MIN = 4;
export const DRAWING_SIZE_MAX = 200;
/** Steps of undo kept in memory. */
export const DRAWING_HISTORY_MAX = 100;
export const DRAWING_ZOOM_MIN = 0.2;
export const DRAWING_ZOOM_MAX = 4;

/** Export limits: the longest side, the pixel count, and the sheet of the rocks/dots cache. */
export const DRAWING_EXPORT_MAX_SIDE = 12000;
export const DRAWING_EXPORT_MAX_PIXELS = 40e6;
export const DRAWING_SCATTER_MAX_SIDE = 8000;
export const DRAWING_SCATTER_MAX_PIXELS = 16e6;

export const DEFAULT_DRAWING_STYLE: MapDrawingStyleDto = {
  grid: 'cross',
  border: 'contour',
  shadow: true,
  theme: 'slate',
  format: 'png',
  resolution: 2,
  quality: 92,
};

/**
 * The colours of the drawn image itself, not of the app: a drawn map looks the same in a dark and a light app
 * theme, and in the exported file. They do not use theme tokens (design principles §6e).
 */
export interface DrawingPalette {
  readonly paper: string;
  readonly floor: string;
  readonly ink: string;
  readonly deco: string;
  readonly grid: string;
  readonly door: string;
  readonly text: string;
}

export const DRAWING_THEMES: Readonly<Record<MapDrawingStyleDto['theme'], DrawingPalette>> = {
  slate: {
    paper: '#1f2a33',
    floor: '#e9dfc8',
    ink: '#c98b4a',
    deco: '#5f7a8a',
    grid: '#6d6250',
    door: '#8a5a33',
    text: '#2b2118',
  },
  moss: {
    paper: '#e3e8d8',
    floor: '#fbf9ef',
    ink: '#2f4a36',
    deco: '#7d9a78',
    grid: '#8c9c84',
    door: '#a9794a',
    text: '#1e3025',
  },
  indigo: {
    paper: '#ece9f2',
    floor: '#ffffff',
    ink: '#34305e',
    deco: '#8e88bd',
    grid: '#a5a1c4',
    door: '#d0a24c',
    text: '#25224a',
  },
};

export type DrawingTool = 'rect' | 'circle' | 'poly' | 'corr' | 'door' | 'text' | 'pan';

/** The tools, in palette order, with their keyboard key and Lucide icon. */
export const DRAWING_TOOLS: readonly {
  readonly id: DrawingTool;
  readonly key: string;
  readonly icon: ArcTechIcon;
}[] = [
  { id: 'rect', key: 'R', icon: 'square' },
  { id: 'circle', key: 'C', icon: 'circle' },
  { id: 'poly', key: 'P', icon: 'pentagon' },
  { id: 'corr', key: 'K', icon: 'route' },
  { id: 'door', key: 'D', icon: 'door-open' },
  { id: 'text', key: 'T', icon: 'type' },
  { id: 'pan', key: 'H', icon: 'hand' },
];
