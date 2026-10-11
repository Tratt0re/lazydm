import { ArcTechCommandDividerComponent } from '@/shared/components/command/command-divider.component';
import { ArcTechCommandEmptyComponent } from '@/shared/components/command/command-empty.component';
import { ArcTechCommandInputComponent } from '@/shared/components/command/command-input.component';
import { ArcTechCommandListComponent } from '@/shared/components/command/command-list.component';
import { ArcTechCommandOptionGroupComponent } from '@/shared/components/command/command-option-group.component';
import { ArcTechCommandOptionComponent } from '@/shared/components/command/command-option.component';
import { ArcTechCommandComponent } from '@/shared/components/command/command.component';

export const ArcTechCommandImports = [
  ArcTechCommandComponent,
  ArcTechCommandInputComponent,
  ArcTechCommandListComponent,
  ArcTechCommandEmptyComponent,
  ArcTechCommandOptionComponent,
  ArcTechCommandOptionGroupComponent,
  ArcTechCommandDividerComponent,
] as const;
