import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import {
  keyCaps,
  SHORTCUT_SCOPES,
  SHORTCUTS,
  type ShortcutDefinition,
} from '@/config/shortcuts.config';
import { ArcTechKbdComponent } from '@/shared/components/kbd';

/** Every keyboard shortcut of the app, by where it works. Read-only. */
@Component({
  selector: 'app-shortcuts-sheet',
  imports: [TranslatePipe, ArcTechKbdComponent],
  template: `
    <div class="flex flex-col gap-6 p-4">
      @for (group of groups; track group.scope) {
        <section>
          <h3 class="font-mono text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {{ 'shortcuts.scopes.' + group.scope | translate }}
          </h3>
          <ul class="mt-2 flex flex-col divide-y divide-border border border-border bg-card">
            @for (shortcut of group.items; track shortcut.id) {
              <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{{ 'shortcuts.items.' + shortcut.id | translate }}</span>
                <span class="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  @for (combo of shortcut.combos; track $index) {
                    @if ($index > 0) {
                      <span class="text-xs text-muted-foreground">{{ 'shortcuts.or' | translate }}</span>
                    }
                    <span class="flex items-center gap-1">
                      @for (cap of caps(combo); track $index) {
                        <arc-kbd>{{ cap }}</arc-kbd>
                      }
                    </span>
                  }
                </span>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppShortcutsSheetComponent {
  protected readonly caps = keyCaps;
  protected readonly groups = SHORTCUT_SCOPES.map((scope) => ({
    scope,
    items: SHORTCUTS.filter((shortcut): shortcut is ShortcutDefinition => shortcut.scope === scope),
  }));
}
