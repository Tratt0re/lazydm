export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  DOCUMENT_LINKS_PANEL_OPEN = 'document_links_panel_open',
  DOCUMENT_PROPERTIES_OPEN = 'document_properties_open',
  DOCUMENT_VIEW_MODES = 'document_view_modes',
  EXPLORER_EXPANDED = 'explorer_expanded',
  MAP_VIEWS = 'map_views',
  EDITOR_SETTINGS = 'editor_settings',
  NOTE_AUDIO_VOLUME = 'note_audio_volume',
  SHOW_FILE_SIZES = 'show_file_sizes',
  SPLIT_RATIO = 'split_ratio',
  TRACKER_ROW_DENSITY = 'tracker_row_density',
}

/** How tall a combatant row of the encounter page is (Settings → General → Tracker rows). */
export type TrackerRowDensity = 'compact' | 'roomy';

export const TRACKER_ROW_DENSITIES: readonly TrackerRowDensity[] = ['compact', 'roomy'];

/**
 * Where a map was left: the centre as fractions of its image and the zoom relative to the zoom that fits the
 * image, so it holds for any window size.
 */
export interface MapViewPreference {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** How a note is shown: live preview (editable, rendered), raw source, or read-only reading view. */
export type DocumentViewMode = 'live' | 'source' | 'reading';

export const DOCUMENT_VIEW_MODES: readonly DocumentViewMode[] = ['live', 'source', 'reading'];

export type EditorTextSize = 'small' | 'medium' | 'large';

export const EDITOR_TEXT_SIZES: readonly EditorTextSize[] = ['small', 'medium', 'large'];

/** Text scale of each size, applied to the live preview, source and reading views alike. */
export const EDITOR_TEXT_SCALES: Readonly<Record<EditorTextSize, number>> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

/** Width of the text column with *Readable line width* on (about 75 characters of body text). */
export const EDITOR_READABLE_WIDTH = '46rem';

/** With *Hide the code map on short notes* on, a note body with fewer lines than this has no map. */
export const CODE_MAP_SHORT_NOTE_LINES = 40;

/** How the note editor looks and behaves on this device (Settings → Editor). */
export interface EditorSettings {
  readonly codeMap: boolean;
  /** Leave the code map out of notes shorter than `CODE_MAP_SHORT_NOTE_LINES` lines (it always shows otherwise). */
  readonly codeMapHideShort: boolean;
  readonly lineNumbers: boolean;
  readonly textSize: EditorTextSize;
  readonly readableWidth: boolean;
  /** The view a note opens in the first time (each note then remembers its own). */
  readonly defaultView: DocumentViewMode;
  readonly spellcheck: boolean;
  readonly lineWrapping: boolean;
  readonly highlightActiveLine: boolean;
  /** Typing an opening bracket or quote also writes the closing one. */
  readonly autoClosePairs: boolean;
  /** The Source view (raw markdown) among the note's views; off, notes offer Live and Reading only. */
  readonly showSourceView: boolean;
}

export const EDITOR_SETTINGS_DEFAULTS: Readonly<EditorSettings> = Object.freeze({
  codeMap: false,
  codeMapHideShort: false,
  lineNumbers: false,
  textSize: 'medium',
  readableWidth: true,
  defaultView: 'live',
  spellcheck: false,
  lineWrapping: true,
  highlightActiveLine: false,
  autoClosePairs: false,
  showSourceView: false,
});

export type ThemePreference = 'light' | 'dark' | 'system';

export interface LocalPreferences {
  readonly theme: ThemePreference;
  readonly themeColor: string;
  readonly language: string;
  readonly onboardingCompleted: boolean;
  readonly documentLinksPanelOpen: boolean;
  /** Whether the properties box (the frontmatter) of a note is shown in the live preview. */
  readonly documentPropertiesOpen: boolean;
  /** Volume of the note audio channel (0–1), the same for every embedded sound on this device. */
  readonly noteAudioVolume: number;
  /** Whether the file rows of the section pages show the size of the file. */
  readonly showFileSizes: boolean;
  /** Height of a combatant row in the encounter page. */
  readonly trackerRowDensity: TrackerRowDensity;
}

export const LOCAL_PREFERENCE_DEFAULTS: Readonly<LocalPreferences> = Object.freeze({
  theme: 'system',
  themeColor: 'default',
  language: 'en',
  onboardingCompleted: false,
  documentLinksPanelOpen: false,
  documentPropertiesOpen: false,
  noteAudioVolume: 1,
  showFileSizes: false,
  trackerRowDensity: 'compact',
});
