import { Component, OnInit, inject } from '@angular/core';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-campaigns-page',
  imports: [ArcTechIconComponent, ArcTechEmptyComponent],
  template: `
    <div class="container mx-auto p-6">
      <arc-empty
        [arcIcon]="'book-open'"
        [arcTitle]="'Campaigns'"
        [arcDescription]="'This section will contain your D&D campaigns. Start creating your first campaign to begin your adventure!'"
      />
    </div>
  `,
})
export class CampaignsPage implements OnInit {
  private readonly toolbarContext = inject(ToolbarContextService);

  ngOnInit(): void {
    this.toolbarContext.activate({ title: 'Campaigns' });
  }
}

// Made with Bob
