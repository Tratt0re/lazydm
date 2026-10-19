import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { EncounterEntityDto } from '@/dtos';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/** Side panel of an encounter: the entities that died (or left), each one can be recovered into the battle. */
@Component({
  selector: 'app-encounter-cemetery',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent, ArcTechTooltipImports],
  template: `
    <h2
      class="flex h-8 shrink-0 items-center justify-between px-2 font-mono text-[11px] font-semibold tracking-[0.11em] text-muted-foreground uppercase"
    >
      {{ 'encounters.cemetery.title' | translate }}
      <span>{{ entities().length }}</span>
    </h2>

    @if (entities().length === 0) {
      <p class="px-3 pb-3 text-xs leading-5 text-muted-foreground">
        {{ 'encounters.cemetery.empty' | translate }}
      </p>
    } @else {
      <ul class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        @for (entity of entities(); track entity.id) {
          <li class="flex items-center gap-2 border border-border-subtle bg-recessed px-3 py-2">
            <arc-icon arcType="skull" class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span
              class="min-w-0 flex-1 truncate text-sm"
              [class.text-muted-foreground]="entity.name === null"
            >
              {{ entity.name ?? ('encounters.entity.unnamed' | translate) }}
            </span>
            <button
              type="button"
              arc-button
              arcType="ghost"
              arcSize="sm"
              class="size-8 shrink-0"
              [attr.aria-label]="'encounters.cemetery.recover' | translate"
              [arcTooltip]="'encounters.cemetery.recover' | translate"
              [disabled]="isDisabled()"
              (click)="recover.emit(entity)"
            >
              <arc-icon arcType="rotate-ccw" />
            </button>
          </li>
        }
      </ul>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 w-80 flex-col overflow-hidden border border-border bg-card p-2',
  },
})
export class AppEncounterCemeteryComponent {
  readonly entities = input.required<readonly EncounterEntityDto[]>();
  readonly isDisabled = input(false);
  readonly recover = output<EncounterEntityDto>();
}
