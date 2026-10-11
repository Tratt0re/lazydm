import { Component, OnInit, inject } from '@angular/core';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ToolbarContextService } from '@/services/toolbar-context.service';

@Component({
  selector: 'app-home-page',
  imports: [ArcTechIconComponent],
  template: `
    <div class="flex h-full items-center justify-center">
      <div class="text-center space-y-6 max-w-2xl px-4">
        <div class="flex justify-center">
          <arc-icon [arcType]="'home'" class="h-24 w-24 text-primary" />
        </div>
        <h1 class="text-4xl font-bold">Welcome to LazyDM</h1>
        <p class="text-xl text-muted-foreground">
          Your lazy dungeon master assistant for managing campaigns, characters, and encounters.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div class="p-6 border rounded-lg space-y-2">
            <arc-icon [arcType]="'book-open'" class="h-8 w-8 text-primary" />
            <h3 class="font-semibold">Campaigns</h3>
            <p class="text-sm text-muted-foreground">Manage your D&D campaigns</p>
          </div>
          <div class="p-6 border rounded-lg space-y-2">
            <arc-icon [arcType]="'users'" class="h-8 w-8 text-primary" />
            <h3 class="font-semibold">Characters</h3>
            <p class="text-sm text-muted-foreground">Track player characters and NPCs</p>
          </div>
          <div class="p-6 border rounded-lg space-y-2">
            <arc-icon [arcType]="'swords'" class="h-8 w-8 text-primary" />
            <h3 class="font-semibold">Encounters</h3>
            <p class="text-sm text-muted-foreground">Plan and run combat encounters</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class HomePage implements OnInit {
  private readonly toolbarContext = inject(ToolbarContextService);

  ngOnInit(): void {
    this.toolbarContext.activate({ title: 'Home' });
  }
}

// Made with Bob
