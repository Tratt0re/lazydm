import type { MapColor } from '@/dtos';

/** The map palette: each colour key is one of the app's theme-aware `--system-app-color-N` tokens. */
const MAP_COLOR_TOKENS: Readonly<Record<MapColor, number>> = {
  red: 1,
  orange: 2,
  yellow: 3,
  green: 5,
  teal: 6,
  blue: 8,
  purple: 9,
  pink: 10,
  gray: 11,
};

/** CSS value of a map colour (follows the dark / light theme). */
export function mapColorVar(color: MapColor): string {
  return `var(--system-app-color-${MAP_COLOR_TOKENS[color]})`;
}

/** The first choice of every map image list: it imports an image from disk instead of choosing an asset. */
export const IMPORT_IMAGE_CHOICE = '__import-from-disk__';

export const DEFAULT_PIN_COLOR: MapColor = 'red';
export const DEFAULT_PATH_COLOR: MapColor = 'blue';
export const DEFAULT_NOTE_COLOR: MapColor = 'yellow';
export const DEFAULT_PATH_WIDTH = 3;

/** Path widths the edit form offers (px). */
export const MAP_PATH_WIDTHS = [2, 3, 5, 8] as const;
