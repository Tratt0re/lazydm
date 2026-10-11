import { Component, OnInit, inject } from '@angular/core';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-encounters-page',
  imports: [ArcTechIconComponent, ArcTechEmptyComponent],
  template: `
    <div class="container mx-auto p-6">
      <arc-empty
        [arcIcon]="'swords'"
        [arcTitle]="'Encounters'"
        [arcDescription]="'This section will contain your combat encounters. Plan your first encounter to challenge your players!'"
      />
    </div>
  `,
})
export class EncountersPage implements OnInit {
  private readonly toolbarContext = inject(ToolbarContextService);

  ngOnInit(): void {
    this.toolbarContext.activate({ title: 'Encounters' });
  }
}

// Made with Bob
