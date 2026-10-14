export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  DOCUMENT_LINKS_PANEL_OPEN = 'document_links_panel_open',
  DOCUMENT_VIEW_MODES = 'document_view_modes',
  EXPLORER_EXPANDED = 'explorer_expanded',
  EDITOR_SETTINGS = 'editor_settings',
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

/** How the note editor looks and behaves on this device (Settings → Editor). */
export interface EditorSettings {
  readonly codeMap: boolean;
  readonly lineNumbers: boolean;
  readonly textSize: EditorTextSize;
  readonly readableWidth: boolean;
  /** The view a note opens in the first time (each note then remembers its own). */
  readonly defaultView: DocumentViewMode;
  readonly spellcheck: boolean;
  readonly lineWrapping: boolean;
  readonly highlightActiveLine: boolean;
}

export const EDITOR_SETTINGS_DEFAULTS: Readonly<EditorSettings> = Object.freeze({
  codeMap: false,
  lineNumbers: false,
  textSize: 'medium',
  readableWidth: true,
  defaultView: 'live',
  spellcheck: false,
  lineWrapping: true,
  highlightActiveLine: false,
});

export type ThemePreference = 'light' | 'dark' | 'system';

export interface LocalPreferences {
  readonly theme: ThemePreference;
  readonly themeColor: string;
  readonly language: string;
  readonly onboardingCompleted: boolean;
  readonly documentLinksPanelOpen: boolean;
}

export const LOCAL_PREFERENCE_DEFAULTS: Readonly<LocalPreferences> = Object.freeze({
  theme: 'system',
  themeColor: 'default',
  language: 'en',
  onboardingCompleted: false,
  documentLinksPanelOpen: true,
});
