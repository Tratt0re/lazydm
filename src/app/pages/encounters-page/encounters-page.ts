import { Component, OnInit, inject } from '@angular/core';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-encounters-page',
  imports: [ZardIconComponent, ZardEmptyComponent],
  template: `
    <div class="container mx-auto p-6">
      <z-empty
        [zIcon]="'swords'"
        [zTitle]="'Encounters'"
        [zDescription]="'This section will contain your combat encounters. Plan your first encounter to challenge your players!'"
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
