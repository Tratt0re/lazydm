import { OverlayModule } from '@angular/cdk/overlay';

import { ArcTechTooltipComponent, ArcTechTooltipDirective } from '@/shared/components/tooltip/tooltip';

export const ArcTechTooltipImports = [ArcTechTooltipComponent, ArcTechTooltipDirective, OverlayModule] as const;
