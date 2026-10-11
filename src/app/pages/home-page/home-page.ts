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
        <h1 class="font-display text-6xl leading-[0.88] font-black tracking-[0.015em] uppercase">
          Welcome to LazyDM<span class="text-primary" aria-hidden="true">.</span>
        </h1>
        <p class="text-sm text-muted-foreground">
          Your lazy dungeon master assistant for managing campaigns, characters, and encounters.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-8 text-left">
          <div class="p-4 border bg-card space-y-3">
            <arc-icon [arcType]="'book-open'" class="h-8 w-8 text-primary" />
            <h3 class="text-xs font-bold uppercase tracking-[0.08em]">Campaigns<span class="text-primary" aria-hidden="true">.</span></h3>
            <p class="text-sm text-muted-foreground">Manage your D&D campaigns</p>
          </div>
          <div class="p-4 border bg-card space-y-3">
            <arc-icon [arcType]="'users'" class="h-8 w-8 text-primary" />
            <h3 class="text-xs font-bold uppercase tracking-[0.08em]">Characters<span class="text-primary" aria-hidden="true">.</span></h3>
            <p class="text-sm text-muted-foreground">Track player characters and NPCs</p>
          </div>
          <div class="p-4 border bg-card space-y-3">
            <arc-icon [arcType]="'swords'" class="h-8 w-8 text-primary" />
            <h3 class="text-xs font-bold uppercase tracking-[0.08em]">Encounters<span class="text-primary" aria-hidden="true">.</span></h3>
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
