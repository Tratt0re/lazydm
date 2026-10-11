import { Component, OnInit, inject } from '@angular/core';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-characters-page',
  imports: [ArcTechIconComponent, ArcTechEmptyComponent],
  template: `
    <div class="container mx-auto p-6">
      <arc-empty
        [arcIcon]="'users'"
        [arcTitle]="'Characters'"
        [arcDescription]="'This section will contain your player characters and NPCs. Create your first character to get started!'"
      />
    </div>
  `,
})
export class CharactersPage implements OnInit {
  private readonly toolbarContext = inject(ToolbarContextService);

  ngOnInit(): void {
    this.toolbarContext.activate({ title: 'Characters' });
  }
}

// Made with Bob
