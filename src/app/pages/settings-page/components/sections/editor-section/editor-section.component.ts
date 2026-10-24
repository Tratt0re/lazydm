import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CODE_MAP_COLORS, type CodeMapKind } from '@/components/code-map/code-map';
import {
  DOCUMENT_VIEW_MODES,
  type DocumentViewMode,
  EDITOR_TEXT_SCALES,
  EDITOR_TEXT_SIZES,
  type EditorSettings,
  type EditorTextSize,
} from '@/config/local-preferences.config';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechSwitchComponent } from '@/shared/components/switch';

type EditorFlag = {
  [K in keyof EditorSettings]: EditorSettings[K] extends boolean ? K : never;
}[keyof EditorSettings];

/** An on/off row of the editor settings: its i18n keys under `settings.editor.<key>`. */
interface EditorFlagRow {
  readonly key: EditorFlag;
  readonly label: string;
  readonly description: string;
}

const flagRow = (key: EditorFlag): EditorFlagRow => ({
  key,
  label: `settings.editor.${key}.label`,
  description: `settings.editor.${key}.description`,
});

/** Settings → Editor: how notes look and behave in the editor, on this device. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-editor-section',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    ...ArcTechSelectImports,
    ArcTechSwitchComponent,
  ],
  templateUrl: './editor-section.component.html',
})
export class EditorSectionComponent {
  private readonly localPreferences = inject(LocalPreferencesService);
  protected readonly settings = this.localPreferences.editorSettings;
  /** Each size's option is written at that size (the editor body text is 15px at medium). */
  protected readonly textSizes = EDITOR_TEXT_SIZES.map((size) => ({
    size,
    fontSize: 15 * EDITOR_TEXT_SCALES[size],
  }));
  /** Source is offered as the default view only while the Source view is shown. */
  protected readonly viewModes = computed(() =>
    DOCUMENT_VIEW_MODES.filter((mode) => mode !== 'source' || this.settings().showSourceView),
  );
  /** A hidden Source default opens notes in Live, so the dropdown shows Live. */
  protected readonly defaultView = computed(() => {
    const { defaultView, showSourceView } = this.settings();
    return defaultView === 'source' && !showSourceView ? 'live' : defaultView;
  });
  /** The code map's colours, shown under its switch. */
  protected readonly codeMapLegend = (Object.keys(CODE_MAP_COLORS) as CodeMapKind[]).map((kind) => ({
    kind,
    color: `var(${CODE_MAP_COLORS[kind]})`,
  }));
  protected readonly displayRows: readonly EditorFlagRow[] = [
    flagRow('codeMap'),
    flagRow('codeMapHideShort'),
    flagRow('lineNumbers'),
    flagRow('readableWidth'),
  ];
  protected readonly behaviourRows: readonly EditorFlagRow[] = [
    flagRow('lineWrapping'),
    flagRow('highlightActiveLine'),
    flagRow('autoClosePairs'),
    flagRow('spellcheck'),
    flagRow('showSourceView'),
  ];

  protected isOn(key: EditorFlag): boolean {
    return this.settings()[key];
  }

  protected setFlag(key: EditorFlag, value: boolean): void {
    this.localPreferences.setEditorSetting(key, value);
  }

  protected setTextSize(value: string | string[]): void {
    if (EDITOR_TEXT_SIZES.includes(value as EditorTextSize)) {
      this.localPreferences.setEditorSetting('textSize', value as EditorTextSize);
    }
  }

  protected setDefaultView(value: string | string[]): void {
    if (DOCUMENT_VIEW_MODES.includes(value as DocumentViewMode)) {
      this.localPreferences.setEditorSetting('defaultView', value as DocumentViewMode);
    }
  }
}
