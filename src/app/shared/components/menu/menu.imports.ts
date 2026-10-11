import { ArcTechContextMenuDirective } from '@/shared/components/menu/context-menu.directive';
import { ArcTechMenuContentDirective } from '@/shared/components/menu/menu-content.directive';
import { ArcTechMenuItemDirective } from '@/shared/components/menu/menu-item.directive';
import { ArcTechMenuLabelComponent } from '@/shared/components/menu/menu-label.component';
import { ArcTechMenuShortcutComponent } from '@/shared/components/menu/menu-shortcut.component';
import { ArcTechMenuDirective } from '@/shared/components/menu/menu.directive';

export const ArcTechMenuImports = [
  ArcTechContextMenuDirective,
  ArcTechMenuContentDirective,
  ArcTechMenuItemDirective,
  ArcTechMenuDirective,
  ArcTechMenuLabelComponent,
  ArcTechMenuShortcutComponent,
] as const;
