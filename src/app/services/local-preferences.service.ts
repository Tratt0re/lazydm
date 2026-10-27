import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import {
  DOCUMENT_VIEW_MODES,
  type DocumentViewMode,
  EDITOR_READABLE_WIDTH,
  EDITOR_SETTINGS_DEFAULTS,
  EDITOR_TEXT_SCALES,
  EDITOR_TEXT_SIZES,
  type EditorSettings,
  LOCAL_PREFERENCE_DEFAULTS,
  LocalPreferenceKey,
  type MapViewPreference,
  type ThemePreference,
  TRACKER_ROW_DENSITIES,
  type TrackerRowDensity,
} from '@/config/local-preferences.config';
import {
  DEFAULT_SECTION_SORT,
  isSectionSortMode,
  type SectionSortMode,
} from '@/config/section-sort.config';

const DOCUMENT_VIEW_MODES_MAX_ENTRIES = 500;
const EXPLORER_EXPANDED_MAX_ENTRIES = 50;
const MAP_VIEWS_MAX_ENTRIES = 200;
const SECTION_SORTS_MAX_ENTRIES = 200;

@Injectable({
  providedIn: 'root',
})
export class LocalPreferencesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly themePreferenceSignal = signal<ThemePreference>(LOCAL_PREFERENCE_DEFAULTS.theme);
  private readonly languagePreferenceSignal = signal<string>(LOCAL_PREFERENCE_DEFAULTS.language);

  readonly themePreference = this.themePreferenceSignal.asReadonly();
  readonly languagePreference = this.languagePreferenceSignal.asReadonly();
  private readonly showFileSizesSignal = signal<boolean>(LOCAL_PREFERENCE_DEFAULTS.showFileSizes);
  /** Settings → General → file sizes in the section lists, on this device. */
  readonly showFileSizes = this.showFileSizesSignal.asReadonly();
  private readonly openLastCampaignSignal = signal<boolean>(
    LOCAL_PREFERENCE_DEFAULTS.openLastCampaign,
  );
  /** Settings → General → open the last campaign at start, on this device. */
  readonly openLastCampaign = this.openLastCampaignSignal.asReadonly();
  private readonly trackerRowDensitySignal = signal<TrackerRowDensity>(
    LOCAL_PREFERENCE_DEFAULTS.trackerRowDensity,
  );
  /** Settings → General → Tracker rows: how tall a combatant row is, on this device. */
  readonly trackerRowDensity = this.trackerRowDensitySignal.asReadonly();
  private readonly editorSettingsSignal = signal<EditorSettings>(EDITOR_SETTINGS_DEFAULTS);
  /** Settings → Editor, on this device. */
  readonly editorSettings = this.editorSettingsSignal.asReadonly();

  init(): void {
    if (!this.isBrowser) {
      return;
    }

    this.setTheme(this.getTheme());
    this.setThemeColor(this.getThemeColor());
    this.setLanguage(this.getLanguage());
    this.setOnboardingCompleted(this.getOnboardingCompleted());
    this.applyEditorSettings(this.readEditorSettings());
    this.showFileSizesSignal.set(this.getShowFileSizes());
    this.openLastCampaignSignal.set(this.getOpenLastCampaign());
    this.trackerRowDensitySignal.set(this.getTrackerRowDensity());
  }

  getTheme(): ThemePreference {
    const value = this.getText(LocalPreferenceKey.THEME);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }

    return LOCAL_PREFERENCE_DEFAULTS.theme;
  }

  setTheme(theme: ThemePreference): void {
    const normalizedTheme: ThemePreference =
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : LOCAL_PREFERENCE_DEFAULTS.theme;

    this.themePreferenceSignal.set(normalizedTheme);
    this.setText(LocalPreferenceKey.THEME, normalizedTheme);
  }

  getThemeColor(): string {
    return this.getText(LocalPreferenceKey.THEME_COLOR) ?? LOCAL_PREFERENCE_DEFAULTS.themeColor;
  }

  setThemeColor(themeColor: string): void {
    this.setText(
      LocalPreferenceKey.THEME_COLOR,
      themeColor.trim() || LOCAL_PREFERENCE_DEFAULTS.themeColor,
    );
  }

  /** Volume of the note audio channel (0–1), on this device. */
  getNoteAudioVolume(): number {
    const value = Number(this.getText(LocalPreferenceKey.NOTE_AUDIO_VOLUME));
    return Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : LOCAL_PREFERENCE_DEFAULTS.noteAudioVolume;
  }

  setNoteAudioVolume(volume: number): void {
    const normalizedVolume = Math.min(1, Math.max(0, volume));
    this.setText(LocalPreferenceKey.NOTE_AUDIO_VOLUME, String(normalizedVolume));
  }

  getLanguage(): string {
    return this.getText(LocalPreferenceKey.LANGUAGE) ?? LOCAL_PREFERENCE_DEFAULTS.language;
  }

  hasLanguagePreference(): boolean {
    return this.getText(LocalPreferenceKey.LANGUAGE) !== undefined;
  }

  setLanguage(language: string): void {
    const normalizedLanguage = language.trim() || LOCAL_PREFERENCE_DEFAULTS.language;
    this.languagePreferenceSignal.set(normalizedLanguage);
    this.setText(LocalPreferenceKey.LANGUAGE, normalizedLanguage);
  }

  getOnboardingCompleted(): boolean {
    const value = this.getText(LocalPreferenceKey.ONBOARDING_COMPLETED);
    return value === '1' || value === 'true' ? true : LOCAL_PREFERENCE_DEFAULTS.onboardingCompleted;
  }

  setOnboardingCompleted(onboardingCompleted: boolean): void {
    this.setText(LocalPreferenceKey.ONBOARDING_COMPLETED, onboardingCompleted ? '1' : '0');
  }

  getShowFileSizes(): boolean {
    const value = this.getText(LocalPreferenceKey.SHOW_FILE_SIZES);
    return value === undefined ? LOCAL_PREFERENCE_DEFAULTS.showFileSizes : value === '1';
  }

  setShowFileSizes(show: boolean): void {
    this.showFileSizesSignal.set(show);
    this.setText(LocalPreferenceKey.SHOW_FILE_SIZES, show ? '1' : '0');
  }

  /** Settings → General: open the last campaign at start, on this device. */
  getOpenLastCampaign(): boolean {
    const value = this.getText(LocalPreferenceKey.OPEN_LAST_CAMPAIGN);
    return value === undefined ? LOCAL_PREFERENCE_DEFAULTS.openLastCampaign : value === '1';
  }

  setOpenLastCampaign(open: boolean): void {
    this.openLastCampaignSignal.set(open);
    this.setText(LocalPreferenceKey.OPEN_LAST_CAMPAIGN, open ? '1' : '0');
  }

  /**
   * The campaign opened last on this vault (per device, so it never goes into the Codex). Stored as
   * `<vault id>:<campaign slug>` so a campaign of another Codex is never reused.
   */
  getLastCampaign(vaultId: string): string | null {
    const value = this.getText(LocalPreferenceKey.LAST_CAMPAIGN);
    const prefix = `${vaultId}:`;
    return value?.startsWith(prefix) ? value.slice(prefix.length) || null : null;
  }

  setLastCampaign(vaultId: string, slug: string): void {
    this.setText(LocalPreferenceKey.LAST_CAMPAIGN, `${vaultId}:${slug}`);
  }

  getTrackerRowDensity(): TrackerRowDensity {
    const value = this.getText(LocalPreferenceKey.TRACKER_ROW_DENSITY);
    return TRACKER_ROW_DENSITIES.includes(value as TrackerRowDensity)
      ? (value as TrackerRowDensity)
      : LOCAL_PREFERENCE_DEFAULTS.trackerRowDensity;
  }

  setTrackerRowDensity(density: TrackerRowDensity): void {
    const normalized = TRACKER_ROW_DENSITIES.includes(density)
      ? density
      : LOCAL_PREFERENCE_DEFAULTS.trackerRowDensity;
    this.trackerRowDensitySignal.set(normalized);
    this.setText(LocalPreferenceKey.TRACKER_ROW_DENSITY, normalized);
  }

  /** Share of the width the first pane takes in the split screen (0–1, per device; half by default). */
  getSplitRatio(): number {
    const value = Number(this.getText(LocalPreferenceKey.SPLIT_RATIO));
    return Number.isFinite(value) && value > 0 && value < 1 ? value : 0.5;
  }

  setSplitRatio(ratio: number): void {
    this.setText(LocalPreferenceKey.SPLIT_RATIO, String(ratio));
  }

  /** Whether the backlinks panel of notes is open (per device). */
  getDocumentLinksPanelOpen(): boolean {
    const value = this.getText(LocalPreferenceKey.DOCUMENT_LINKS_PANEL_OPEN);
    return value === undefined ? LOCAL_PREFERENCE_DEFAULTS.documentLinksPanelOpen : value === '1';
  }

  setDocumentLinksPanelOpen(isOpen: boolean): void {
    this.setText(LocalPreferenceKey.DOCUMENT_LINKS_PANEL_OPEN, isOpen ? '1' : '0');
  }

  /** Whether the properties box of notes is shown in the live preview (per device; closed by default). */
  getDocumentPropertiesOpen(): boolean {
    const value = this.getText(LocalPreferenceKey.DOCUMENT_PROPERTIES_OPEN);
    return value === undefined ? LOCAL_PREFERENCE_DEFAULTS.documentPropertiesOpen : value === '1';
  }

  setDocumentPropertiesOpen(isOpen: boolean): void {
    this.setText(LocalPreferenceKey.DOCUMENT_PROPERTIES_OPEN, isOpen ? '1' : '0');
  }

  /**
   * View chosen for a note on this device (the editor's default view when never chosen). Source falls
   * back to Live while the Source view is hidden (Settings → Editor).
   */
  getDocumentViewMode(path: string): DocumentViewMode {
    const settings = this.editorSettingsSignal();
    const mode = this.readDocumentViewModes()[path] ?? settings.defaultView;
    return mode === 'source' && !settings.showSourceView ? 'live' : mode;
  }

  setEditorSetting<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]): void {
    const settings = this.normalizeEditorSettings({ ...this.editorSettingsSignal(), [key]: value });
    this.setJson(LocalPreferenceKey.EDITOR_SETTINGS, settings);
    this.applyEditorSettings(settings);
  }

  private readEditorSettings(): EditorSettings {
    return this.normalizeEditorSettings(
      this.getJson<Partial<Record<keyof EditorSettings, unknown>>>(
        LocalPreferenceKey.EDITOR_SETTINGS,
      ) ?? {},
    );
  }

  /** Known values only; anything else (an older or hand-edited entry) falls back to the default. */
  private normalizeEditorSettings(
    value: Partial<Record<keyof EditorSettings, unknown>>,
  ): EditorSettings {
    const defaults = EDITOR_SETTINGS_DEFAULTS;
    const flag = (key: keyof EditorSettings) =>
      typeof value[key] === 'boolean' ? (value[key] as boolean) : (defaults[key] as boolean);
    return {
      codeMap: flag('codeMap'),
      codeMapHideShort: flag('codeMapHideShort'),
      lineNumbers: flag('lineNumbers'),
      textSize: EDITOR_TEXT_SIZES.includes(value.textSize as EditorSettings['textSize'])
        ? (value.textSize as EditorSettings['textSize'])
        : defaults.textSize,
      readableWidth: flag('readableWidth'),
      defaultView: DOCUMENT_VIEW_MODES.includes(value.defaultView as DocumentViewMode)
        ? (value.defaultView as DocumentViewMode)
        : defaults.defaultView,
      spellcheck: flag('spellcheck'),
      lineWrapping: flag('lineWrapping'),
      highlightActiveLine: flag('highlightActiveLine'),
      autoClosePairs: flag('autoClosePairs'),
      showSourceView: flag('showSourceView'),
    };
  }

  /** Text size, column width and code wrapping are CSS variables, shared by the editor views and Reading. */
  private applyEditorSettings(settings: EditorSettings): void {
    this.editorSettingsSignal.set(settings);
    if (!this.isBrowser) {
      return;
    }

    const root = document.documentElement.style;
    root.setProperty('--editor-text-scale', String(EDITOR_TEXT_SCALES[settings.textSize]));
    root.setProperty('--editor-max-width', settings.readableWidth ? EDITOR_READABLE_WIDTH : 'none');
    root.setProperty('--editor-pre-white-space', settings.lineWrapping ? 'pre-wrap' : 'pre');
  }

  /** Remembers the view of a note; only the most recent notes are kept. */
  setDocumentViewMode(path: string, mode: DocumentViewMode): void {
    const modes = this.readDocumentViewModes();
    delete modes[path];
    modes[path] = mode;
    const entries = Object.entries(modes).slice(-DOCUMENT_VIEW_MODES_MAX_ENTRIES);
    this.setText(
      LocalPreferenceKey.DOCUMENT_VIEW_MODES,
      JSON.stringify(Object.fromEntries(entries)),
    );
  }

  /** Folders left open in an explorer sidebar (`campaign:<slug>`, `compendium`), per device. */
  getExplorerExpanded(stateKey: string): readonly string[] {
    const keys = this.readExplorerExpanded()[stateKey];
    return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : [];
  }

  /** Remembers the open folders of an explorer; only the most recent explorers are kept. */
  setExplorerExpanded(stateKey: string, keys: readonly string[]): void {
    const all = this.readExplorerExpanded();
    delete all[stateKey];
    all[stateKey] = [...keys];
    const entries = Object.entries(all).slice(-EXPLORER_EXPANDED_MAX_ENTRIES);
    this.setJson(LocalPreferenceKey.EXPLORER_EXPANDED, Object.fromEntries(entries));
  }

  /** Where a map (vault path) was left on this device; null when it was never moved. */
  getMapView(path: string): MapViewPreference | null {
    const view = this.readMapViews()[path] as Partial<MapViewPreference> | undefined;
    return view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.zoom)
      ? { x: view.x as number, y: view.y as number, zoom: view.zoom as number }
      : null;
  }

  /** Remembers where a map was left; only the most recent maps are kept. */
  setMapView(path: string, view: MapViewPreference): void {
    const all = this.readMapViews();
    delete all[path];
    all[path] = view;
    const entries = Object.entries(all).slice(-MAP_VIEWS_MAX_ENTRIES);
    this.setJson(LocalPreferenceKey.MAP_VIEWS, Object.fromEntries(entries));
  }

  /** How the files of a section (its folder path in the vault) are sorted on this device. */
  getSectionSort(sectionPath: string): SectionSortMode {
    const mode = this.readSectionSorts()[sectionPath];
    return isSectionSortMode(mode) ? mode : DEFAULT_SECTION_SORT;
  }

  /** Remembers the sort of a section; only the most recent sections are kept. */
  setSectionSort(sectionPath: string, mode: SectionSortMode): void {
    const all = this.readSectionSorts();
    delete all[sectionPath];
    all[sectionPath] = mode;
    const entries = Object.entries(all).slice(-SECTION_SORTS_MAX_ENTRIES);
    this.setJson(LocalPreferenceKey.SECTION_SORTS, Object.fromEntries(entries));
  }

  private readSectionSorts(): Record<string, unknown> {
    const parsed = this.getJson<unknown>(LocalPreferenceKey.SECTION_SORTS);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  }

  private readMapViews(): Record<string, unknown> {
    const parsed = this.getJson<unknown>(LocalPreferenceKey.MAP_VIEWS);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  }

  private readExplorerExpanded(): Record<string, unknown> {
    const parsed = this.getJson<unknown>(LocalPreferenceKey.EXPLORER_EXPANDED);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  }

  private readDocumentViewModes(): Record<string, DocumentViewMode> {
    try {
      const parsed: unknown = JSON.parse(
        this.getText(LocalPreferenceKey.DOCUMENT_VIEW_MODES) ?? '{}',
      );
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed).filter(([, mode]) =>
          DOCUMENT_VIEW_MODES.includes(mode as DocumentViewMode),
        ),
      ) as Record<string, DocumentViewMode>;
    } catch {
      return {};
    }
  }

  private getText(key: LocalPreferenceKey): string | undefined {
    if (!this.isBrowser) {
      return undefined;
    }

    try {
      const value = localStorage.getItem(key);
      if (!value) {
        return undefined;
      }

      const normalizedValue = value.trim();
      return normalizedValue.length > 0 ? normalizedValue : undefined;
    } catch {
      return undefined;
    }
  }

  private setText(key: LocalPreferenceKey, value: string): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore localStorage write errors (private mode, quota, etc.).
    }
  }

  private getJson<T>(key: LocalPreferenceKey): T | null {
    const value = this.getText(key);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  private setJson(key: LocalPreferenceKey, value: unknown): void {
    if (!this.isBrowser) {
      return;
    }

    if (value === null || value === undefined) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore localStorage write errors (private mode, quota, etc.).
      }
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore localStorage write errors (private mode, quota, etc.).
    }
  }
}
