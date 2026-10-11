import { ArcTechDropdownMenuItemComponent } from '@/shared/components/dropdown/dropdown-item.component';
import { ArcTechDropdownMenuContentComponent } from '@/shared/components/dropdown/dropdown-menu-content.component';
import { ArcTechDropdownDirective } from '@/shared/components/dropdown/dropdown-trigger.directive';
import { ArcTechDropdownMenuComponent } from '@/shared/components/dropdown/dropdown.component';
import { ArcTechMenuLabelComponent } from '@/shared/components/menu/menu-label.component';

export const ArcTechDropdownImports = [
  ArcTechDropdownMenuComponent,
  ArcTechDropdownMenuItemComponent,
  ArcTechMenuLabelComponent,
  ArcTechDropdownMenuContentComponent,
  ArcTechDropdownDirective,
] as const;
