import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CODE_MAP_COLORS, type CodeMapKind } from '@/components/code-map/code-map';
import {
  DOCUMENT_VIEW_MODES,
  type DocumentViewMode,
  EDITOR_TEXT_SIZES,
  type EditorSettings,
  type EditorTextSize,
} from '@/config/local-preferences.config';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import {
  ArcTechSegmentedComponent,
  ArcTechSegmentedItemComponent,
} from '@/shared/components/segmented';
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
  selector: 'app-editor-section',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    ArcTechSegmentedComponent,
    ArcTechSegmentedItemComponent,
    ArcTechSwitchComponent,
  ],
  templateUrl: './editor-section.component.html',
})
export class EditorSectionComponent {
  private readonly localPreferences = inject(LocalPreferencesService);
  protected readonly settings = this.localPreferences.editorSettings;
  protected readonly textSizes = EDITOR_TEXT_SIZES;
  protected readonly viewModes = DOCUMENT_VIEW_MODES;
  /** The code map's colours, shown under its switch. */
  protected readonly codeMapLegend = (Object.keys(CODE_MAP_COLORS) as CodeMapKind[]).map((kind) => ({
    kind,
    color: `var(${CODE_MAP_COLORS[kind]})`,
  }));
  protected readonly displayRows: readonly EditorFlagRow[] = [
    flagRow('codeMap'),
    flagRow('lineNumbers'),
    flagRow('readableWidth'),
  ];
  protected readonly behaviourRows: readonly EditorFlagRow[] = [
    flagRow('lineWrapping'),
    flagRow('highlightActiveLine'),
    flagRow('autoClosePairs'),
    flagRow('spellcheck'),
  ];

  protected isOn(key: EditorFlag): boolean {
    return this.settings()[key];
  }

  protected setFlag(key: EditorFlag, value: boolean): void {
    this.localPreferences.setEditorSetting(key, value);
  }

  protected setTextSize(value: string): void {
    if (EDITOR_TEXT_SIZES.includes(value as EditorTextSize)) {
      this.localPreferences.setEditorSetting('textSize', value as EditorTextSize);
    }
  }

  protected setDefaultView(value: string): void {
    if (DOCUMENT_VIEW_MODES.includes(value as DocumentViewMode)) {
      this.localPreferences.setEditorSetting('defaultView', value as DocumentViewMode);
    }
  }
}
