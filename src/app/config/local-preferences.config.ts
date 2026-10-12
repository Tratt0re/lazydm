export enum LocalPreferenceKey {
  THEME = 'theme',
  THEME_COLOR = 'theme_color',
  LANGUAGE = 'language',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  DOCUMENT_LINKS_PANEL_OPEN = 'document_links_panel_open',
  DOCUMENT_VIEW_MODES = 'document_view_modes',
}

/** How a note is shown: live preview (editable, rendered), raw source, or read-only reading view. */
export type DocumentViewMode = 'live' | 'source' | 'reading';

export const DOCUMENT_VIEW_MODES: readonly DocumentViewMode[] = ['live', 'source', 'reading'];

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
