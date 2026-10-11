import { Component, OnInit, inject } from '@angular/core';
import { ZardIconComponent } from '@/shared/components/icon';
import { ZardEmptyComponent } from '@/shared/components/empty';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-characters-page',
  imports: [ZardIconComponent, ZardEmptyComponent],
  template: `
    <div class="container mx-auto p-6">
      <z-empty
        [zIcon]="'users'"
        [zTitle]="'Characters'"
        [zDescription]="'This section will contain your player characters and NPCs. Create your first character to get started!'"
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
