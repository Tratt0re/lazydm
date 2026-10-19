import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

import { FooterComponent } from '@/shared/components/layout/footer.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-footer',
  imports: [FooterComponent],
  templateUrl: './footer.html',
  encapsulation: ViewEncapsulation.None,
})
export class Footer {
  protected readonly currentYear = new Date().getFullYear();
}
