import { Component, OnInit, inject } from '@angular/core';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-campaigns-page',
  imports: [ZardIconComponent, ZardEmptyComponent],
  template: `
    <div class="container mx-auto p-6">
      <z-empty
        [zIcon]="'book-open'"
        [zTitle]="'Campaigns'"
        [zDescription]="'This section will contain your D&D campaigns. Start creating your first campaign to begin your adventure!'"
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
