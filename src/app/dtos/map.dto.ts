/** User colours of pins, paths and notes: keys of a fixed palette, never free hex values. */
export const MAP_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;
export type MapColor = (typeof MAP_COLORS)[number];

/** Lucide icons a pin can show (same list as the Electron model). */
export const MAP_PIN_ICONS = [
  'map-pin',
  'castle',
  'house',
  'tent',
  'skull',
  'swords',
  'flag',
  'star',
  'gem',
  'landmark',
  'trees',
  'mountain',
  'anchor',
  'door-open',
  'triangle-alert',
] as const;
export type MapPinIcon = (typeof MAP_PIN_ICONS)[number];

/** A point as a fraction of the image: 0..1, origin top-left. */
export interface MapPointDto {
  readonly x: number;
  readonly y: number;
}

export interface MapPinDto extends MapPointDto {
  readonly id: string;
  readonly label: string;
  readonly color: MapColor;
  readonly icon: MapPinIcon;
  /** Vault path of a note, asset or encounter of the same scope; null for none. */
  readonly link: string | null;
}

export interface MapPathDto {
  readonly id: string;
  readonly points: readonly MapPointDto[];
  readonly color: MapColor;
  readonly width: number;
  readonly label: string;
  /** A polygon: the last point joins the first and the area is filled. */
  readonly closed: boolean;
}

export interface MapNoteDto extends MapPointDto {
  readonly id: string;
  readonly text: string;
  readonly color: MapColor;
}

export const MAP_DRAWING_GRIDS = ['cross', 'lines', 'none'] as const;
export const MAP_DRAWING_BORDERS = ['contour', 'rocks', 'dots', 'none'] as const;
export const MAP_DRAWING_THEMES = ['slate', 'moss', 'indigo'] as const;
export const MAP_DRAWING_FORMATS = ['png', 'jpg'] as const;
export const MAP_DRAWING_RESOLUTIONS = [1, 2, 3] as const;

export interface MapDrawingStyleDto {
  readonly grid: (typeof MAP_DRAWING_GRIDS)[number];
  readonly border: (typeof MAP_DRAWING_BORDERS)[number];
  readonly shadow: boolean;
  readonly theme: (typeof MAP_DRAWING_THEMES)[number];
  readonly format: (typeof MAP_DRAWING_FORMATS)[number];
  readonly resolution: (typeof MAP_DRAWING_RESOLUTIONS)[number];
  /** JPG quality, 50..100. */
  readonly quality: number;
}

/** A point in world pixels (`CELL` px per square), origin top-left of the sheet. */
export type MapDrawingPoint = readonly [number, number];
/** A closed loop: the last point repeats the first. */
export type MapDrawingRing = readonly MapDrawingPoint[];
/** An outline followed by its holes. */
export type MapDrawingPolygon = readonly MapDrawingRing[];

export interface MapDrawingDoorDto {
  readonly x: number;
  readonly y: number;
  /** Radians. */
  readonly angle: number;
}

export interface MapDrawingTextDto {
  readonly x: number;
  readonly y: number;
  readonly s: string;
}

/** The editable drawing of a drawn map; the generated image is the map's `image`. The sheet size is fixed. */
export interface MapDrawingDto {
  readonly cols: number;
  readonly rows: number;
  readonly floor: readonly MapDrawingPolygon[];
  readonly doors: readonly MapDrawingDoorDto[];
  readonly texts: readonly MapDrawingTextDto[];
  readonly style: MapDrawingStyleDto;
}

export interface MapDto {
  readonly version: number;
  readonly name: string;
  /** Vault path of the image in the scope's assets/; null when none is set. */
  readonly image: string | null;
  /** The drawing of a drawn map; null for a map made from an imported image. */
  readonly drawing: MapDrawingDto | null;
  readonly pins: readonly MapPinDto[];
  readonly paths: readonly MapPathDto[];
  readonly notes: readonly MapNoteDto[];
}

export interface MapFileDto {
  readonly path: string;
  readonly map: MapDto;
  /** The file is not valid JSON: it opens empty and saving would replace it. */
  readonly parseError: string | null;
  readonly contentHash: string;
  readonly mtimeMs: number;
}

export interface WriteMapPayload {
  readonly path: string;
  readonly map: MapDto;
  /** Hash of the file as loaded; null when the file is new. */
  readonly expectedHash: string | null;
}

export type WriteMapResultDto =
  | { readonly status: 'saved'; readonly contentHash: string; readonly mtimeMs: number }
  | { readonly status: 'conflict'; readonly current: MapFileDto };

export interface CreateMapPayload {
  readonly folder: string;
  readonly name: string;
  /** Vault path of an image of the scope's assets/; omitted for a drawn map. */
  readonly image?: string;
  /** A drawn map: the sheet size in squares; the image comes with the first save of the drawing. */
  readonly drawing?: { readonly cols: number; readonly rows: number };
}
