import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { AppShortcutsSheetComponent } from '@/components/shortcuts-sheet/shortcuts-sheet.component';
import { ArcTechSheetService, type ArcTechSheetRef } from '@/shared/components/sheet';

/** Opens the list of keyboard shortcuts in a side sheet (title bar button, Cmd/Ctrl+/, Help menu). */
@Injectable({ providedIn: 'root' })
export class ShortcutsSheetService {
  private readonly sheetService = inject(ArcTechSheetService);
  private readonly translateService = inject(TranslateService);
  private sheetRef: ArcTechSheetRef<AppShortcutsSheetComponent> | null = null;

  /** Opens the list; asked again while open, it closes. */
  toggle(): void {
    // The sheet closes itself (Esc, a click outside) without telling: the page shows whether it is still open.
    if (this.sheetRef && document.querySelector('app-shortcuts-sheet')) {
      this.sheetRef.close();
      this.sheetRef = null;
      return;
    }

    const ref = this.sheetService.create<AppShortcutsSheetComponent, void>({
      arcTitle: this.translateService.instant('shortcuts.title'),
      arcDescription: this.translateService.instant('shortcuts.description'),
      arcContent: AppShortcutsSheetComponent,
      arcSide: 'right',
      arcWidth: '520px',
      arcHideFooter: true,
    });
    this.sheetRef = ref;
  }
}
