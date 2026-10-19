import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sidebar-toggle',
  imports: [ArcTechButtonComponent, ArcTechIconComponent, ArcTechTooltipImports, TranslatePipe],
  templateUrl: './sidebar-toggle.component.html',
})
export class SidebarToggleComponent {
  readonly sidebarCollapsed = input(false);
  readonly toggle = output<void>();

  protected onToggle(): void {
    this.toggle.emit();
  }
}
