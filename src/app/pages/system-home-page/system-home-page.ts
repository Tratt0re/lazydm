import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import { CAMPAIGN_SECTIONS, COMPENDIUM_EXTRA_SECTIONS } from '@/config/menu.config';
import { CompendiumService } from '@/services/compendium.service';
import { DocumentService } from '@/services/document.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';

const NOTE_SECTIONS = CAMPAIGN_SECTIONS.filter((section) => section.noteType !== null);

/** Overview of a compendium system: the folders it has so far, and a way to create notes in it. */
@Component({
  selector: 'app-system-home-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
  ],
  template: `
    @if (system(); as system) {
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <p class="max-w-3xl text-sm text-muted-foreground">
            {{ system.description || ('compendium.system.description' | translate) }}
          </p>
          @if (sections().length > 0) {
            <button arc-button type="button" (click)="openCreateSheet()">
              <arc-icon arcType="plus" />
              {{ 'compendium.system.newNote' | translate }}
            </button>
          }
        </div>

        @if (sections().length === 0) {
          <arc-empty
            class="border border-dashed border-border bg-card/60"
            arcIcon="library-big"
            [arcTitle]="'compendium.system.emptyTitle' | translate"
            [arcDescription]="'compendium.system.emptyDescription' | translate"
            [arcActions]="[createAction]"
          />
          <ng-template #createAction>
            <button arc-button type="button" (click)="openCreateSheet()">
              <arc-icon arcType="plus" />
              {{ 'compendium.system.newNote' | translate }}
            </button>
          </ng-template>
        } @else {
          <ul class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            @for (section of sections(); track section.key) {
              <li>
                <a
                  [routerLink]="['/compendium', system.slug, section.key]"
                  class="flex h-full flex-col gap-3 border border-border bg-card p-4 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <arc-icon [arcType]="section.icon" class="size-6 text-primary" />
                  <h2 class="text-xs font-bold tracking-[0.08em] uppercase">
                    {{ 'nav.items.' + section.key | translate
                    }}<span class="text-primary" aria-hidden="true">.</span>
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    {{ 'campaigns.sections.' + section.key + '.description' | translate }}
                  </p>
                </a>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class SystemHomePage {
  private readonly compendiumService = inject(CompendiumService);
  private readonly documentService = inject(DocumentService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly router = inject(Router);

  protected readonly system = this.compendiumService.activeSystem;
  /** Folders the system has, in campaign section order. */
  protected readonly sections = computed(() => {
    const folders = this.system()?.folders ?? [];
    return [...CAMPAIGN_SECTIONS, ...COMPENDIUM_EXTRA_SECTIONS].filter((section) =>
      folders.includes(section.key),
    );
  });

  constructor() {
    effect((onCleanup) => {
      const system = this.system();
      if (system) {
        onCleanup(
          this.toolbarContext.activate({
            title: system.name,
            titleMode: 'breadcrumb',
            titleBreadcrumbs: [{ label: 'compendium.list.title', path: '/compendium' }],
          }),
        );
      }
    });
  }

  /** New note: its type decides the folder, which is created when missing. */
  protected openCreateSheet(): void {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('compendium.system.newNote'),
      arcOkText: this.translateService.instant('campaigns.sections.newNote.submit'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [
        {
          id: 'title',
          type: 'input',
          label: 'campaigns.sections.newNote.titleLabel',
          placeholder: 'campaigns.sections.newNote.titlePlaceholder',
          required: true,
          translate: true,
        },
        {
          id: 'section',
          type: 'select',
          label: 'compendium.system.typeLabel',
          value: NOTE_SECTIONS[0].key,
          required: true,
          translate: true,
          options: NOTE_SECTIONS.map((section) => ({
            value: section.key,
            label: `nav.items.${section.key}`,
            icon: section.icon,
            translate: true,
          })),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          const section =
            NOTE_SECTIONS.find((item) => item.key === values['section']) ?? NOTE_SECTIONS[0];
          void this.createNote(
            String(values['title'] ?? ''),
            section.key,
            section.noteType ?? '',
          ).then((created) => {
            isSubmitting = false;
            if (created) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  private async createNote(title: string, sectionKey: string, type: string): Promise<boolean> {
    const system = this.system();
    if (!system) {
      return false;
    }

    try {
      const note = await this.documentService.create({
        folder: `${system.path}/${sectionKey}`,
        title,
        type,
      });
      await this.compendiumService.refreshActive();
      const noteSlug = note.path.split('/').pop()!.replace(/\.md$/i, '');
      await this.router.navigate(['/compendium', system.slug, sectionKey, noteSlug]);
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('compendium.system.createError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
