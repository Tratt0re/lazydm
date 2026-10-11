import { Injectable } from '@angular/core';

import type { ArcTechMenuDirective } from './menu.directive';

@Injectable({
  providedIn: 'root',
})
export class ArcTechMenuManagerService {
  private activeHoverMenu: ArcTechMenuDirective | null = null;

  registerHoverMenu(menu: ArcTechMenuDirective): void {
    if (this.activeHoverMenu && this.activeHoverMenu !== menu) {
      this.activeHoverMenu.close();
    }
    this.activeHoverMenu = menu;
  }

  unregisterHoverMenu(menu: ArcTechMenuDirective): void {
    if (this.activeHoverMenu === menu) {
      this.activeHoverMenu = null;
    }
  }

  closeActiveMenu(): void {
    if (this.activeHoverMenu) {
      this.activeHoverMenu.close();
      this.activeHoverMenu = null;
    }
  }
}
