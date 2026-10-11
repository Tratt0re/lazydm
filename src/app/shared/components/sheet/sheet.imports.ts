import { OverlayModule } from '@angular/cdk/overlay';
import { PortalModule } from '@angular/cdk/portal';

import { ArcTechSheetComponent } from '@/shared/components/sheet/sheet.component';

export const ArcTechSheetImports = [ArcTechSheetComponent, OverlayModule, PortalModule] as const;
