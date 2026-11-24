import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import type { ImportPreviewDto, ImportedCampaignDto, ZipRefusalCode } from '@/dtos';
import { CampaignBundleService } from '@/services/campaign-bundle.service';
import { CampaignService } from '@/services/campaign.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ARC_MODAL_DATA, ArcTechDialogRef } from '@/shared/components/dialog';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechInputDirective } from '@/shared/components/input';
import { formatFileSize } from '@/shared/utils/file-size';

/** What the *Import campaign* modal does once a campaign is imported. */
export interface CampaignImportSheetData {
  readonly onImported: (result: ImportedCampaignDto) => void;
}

/** The sentence (a key under `campaigns.import.error`) that explains why a zip was refused. */
const REFUSAL_REASON: Readonly<Record<ZipRefusalCode, string>> = {
  'not-a-zip': 'notAZip',
  empty: 'shape',
  'no-folder': 'shape',
  'multiple-folders': 'shape',
  corrupt: 'damaged',
  'unsupported-compression': 'damaged',
  encrypted: 'encrypted',
  'too-large-file': 'tooLarge',
  'too-many-entries': 'tooLarge',
  'too-many-bytes': 'tooLarge',
  ratio: 'tooLarge',
  'special-file': 'unsafe',
  'unsafe-path': 'unsafe',
  duplicate: 'unsafe',
  'newer-version': 'newer',
};
const SKIP_REASONS = ['type', 'too-large', 'name', 'party', 'invalid'];
const NAME_MAX_LENGTH = 80;

/**
 * Content of the *Import campaign* modal (design-principles §6g): step 1 is the same drop zone as *Import from
 * disk* in Assets (drop a zip, or pick one in the system dialog); step 2 shows what is in the zip, with the name
 * of the new campaign, and creates it. Nothing is written before the last button. The dialog's own footer holds
 * *Back*, *Cancel* and the confirm button; this component only tells it which to show (`setStep`).
 */
@Component({
  selector: 'app-campaign-import-sheet',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechInputDirective,
  ],
  template: `
    @if (step() === 'pick') {
      @if (errorKey(); as key) {
        <arc-alert
          class="mb-4"
          arcType="destructive"
          arcIcon="circle-alert"
          [arcTitle]="'campaigns.import.error.title' | translate"
          [arcDescription]="'campaigns.import.error.' + key | translate"
        />
      }

      <div
        #zone
        tabindex="0"
        class="flex min-h-56 flex-col items-center justify-center gap-4 border border-dashed p-6 text-center transition-colors outline-none focus-visible:border-primary"
        [class]="
          isDragOver()
            ? 'border-primary bg-accent text-primary'
            : 'border-border-strong bg-recessed text-muted-foreground'
        "
        (dragover)="onDragOver($event)"
        (dragleave)="isDragOver.set(false)"
        (drop)="onDrop($event)"
      >
        <arc-icon arcType="archive" class="size-8" />
        <p class="max-w-xs text-sm">{{ 'campaigns.import.dropHint' | translate }}</p>
        <p class="font-mono text-[11px] tracking-[0.04em] uppercase">
          {{ 'campaigns.import.types' | translate }}
        </p>
        <button
          type="button"
          arc-button
          arcType="outline"
          [arcLoading]="isBusy()"
          [disabled]="isBusy()"
          (click)="scan()"
        >
          <arc-icon arcType="folder" />
          {{ 'campaigns.import.select' | translate }}
        </button>
      </div>
    } @else if (preview(); as info) {
      <div class="flex flex-col gap-5">
        <div>
          <label for="campaign-import-name" class="mb-1.5 block text-sm font-medium">
            {{ 'campaigns.create.nameLabel' | translate }}
            <span class="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            #nameInput
            id="campaign-import-name"
            arc-input
            type="text"
            autocomplete="off"
            [maxLength]="nameMaxLength"
            [value]="name()"
            [disabled]="isBusy()"
            [attr.aria-invalid]="isNameEmpty() ? 'true' : null"
            (input)="name.set($any($event.target).value)"
            (keydown.enter)="confirm()"
          />
          <p class="mt-1 text-xs text-muted-foreground">
            {{
              (isNameTaken() ? 'campaigns.import.nameTaken' : 'campaigns.create.nameDescription')
                | translate
            }}
          </p>
        </div>

        <div>
          <!-- Hairlines are the grid's own gap, so an odd last cell can take the whole row without a stray block. -->
          <dl class="grid grid-cols-2 gap-px border border-border bg-border-subtle text-sm">
            <div
              class="flex items-baseline justify-between gap-3 bg-recessed px-3 py-2 odd:last:col-span-2"
            >
              <dt class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
                {{ 'campaigns.create.systemLabel' | translate }}
              </dt>
              <dd class="font-semibold">
                {{ 'settings.templates.systems.' + info.system | translate }}
              </dd>
            </div>
            @for (row of rows(); track row.key) {
              <div
                class="flex items-baseline justify-between gap-3 bg-recessed px-3 py-2 odd:last:col-span-2"
              >
                <dt class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
                  {{ row.label | translate }}
                </dt>
                <dd class="font-semibold tabular-nums">{{ row.value }}</dd>
              </div>
            }
            @if (info.hasAgentRules) {
              <div
                class="flex items-center justify-between gap-3 bg-recessed px-3 py-2 odd:last:col-span-2"
              >
                <dt class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
                  {{ 'settings.sections.agentRules.title' | translate }}
                </dt>
                <dd class="text-primary"><arc-icon arcType="check" class="size-4" /></dd>
              </div>
            }
            @if (info.hasQuickReference) {
              <div
                class="flex items-center justify-between gap-3 bg-recessed px-3 py-2 odd:last:col-span-2"
              >
                <dt class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
                  {{ 'quickReference.title' | translate }}
                </dt>
                <dd class="text-primary"><arc-icon arcType="check" class="size-4" /></dd>
              </div>
            }
          </dl>
          <p class="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-muted-foreground uppercase">
            {{ 'campaigns.import.total' | translate: { count: info.files, size: size() } }}
          </p>
        </div>

        @if (info.skippedTotal > 0 || info.warnings.length > 0) {
          <arc-alert
            arcType="warning"
            arcIcon="triangle-alert"
            [arcTitle]="
              info.skippedTotal > 0
                ? ('campaigns.import.skippedTitle' | translate: { count: info.skippedTotal })
                : ('campaigns.import.settingsWarning' | translate)
            "
            [arcDescription]="details"
          />
          <ng-template #details>
            @if (info.skippedTotal > 0) {
              <ul class="space-y-1">
                @for (file of info.skipped; track file.path) {
                  <li class="flex flex-wrap items-baseline gap-x-2">
                    <span class="font-mono text-xs break-all text-card-foreground">{{
                      file.path
                    }}</span>
                    <span class="text-xs">{{ skipReasonKey(file.reason) | translate }}</span>
                  </li>
                }
                @if (info.skippedTotal > info.skipped.length) {
                  <li class="text-xs">
                    {{
                      'campaigns.import.skippedMore'
                        | translate: { count: info.skippedTotal - info.skipped.length }
                    }}
                  </li>
                }
              </ul>
            }
            @if (info.skippedTotal > 0 && info.warnings.length > 0) {
              <p class="mt-2">{{ 'campaigns.import.settingsWarning' | translate }}</p>
            }
          </ng-template>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block px-1 pb-1' },
})
export class AppCampaignImportSheetComponent {
  private readonly data = inject<CampaignImportSheetData>(ARC_MODAL_DATA);
  private readonly dialogRef = inject(ArcTechDialogRef);
  private readonly bundleService = inject(CampaignBundleService);
  private readonly campaignService = inject(CampaignService);
  private readonly translateService = inject(TranslateService);
  private readonly zone = viewChild<ElementRef<HTMLElement>>('zone');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly step = signal<'pick' | 'review'>('pick');
  protected readonly isDragOver = signal(false);
  /** Looking into a zip, or importing it. */
  protected readonly isBusy = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly preview = signal<ImportPreviewDto | null>(null);
  protected readonly name = signal('');
  private zipPath: string | null = null;

  protected readonly isNameEmpty = computed(() => this.name().trim().length === 0);
  /** A campaign with this name exists: the new one still gets a folder of its own, and the page says so. */
  protected readonly isNameTaken = computed(() => {
    const typed = this.name().trim().toLowerCase();
    return (
      typed.length > 0 &&
      this.campaignService
        .campaigns()
        .some((campaign) => campaign.name.trim().toLowerCase() === typed)
    );
  });
  protected readonly size = computed(() => formatFileSize(this.preview()?.bytes ?? 0));
  /** The kinds of file the zip holds, with a count; the ones it does not hold are not listed. */
  protected readonly rows = computed(() => {
    const counts = this.preview()?.counts;
    if (!counts) {
      return [];
    }

    return [
      { key: 'notes', label: 'nav.items.notes', value: counts.notes },
      { key: 'assets', label: 'nav.items.assets', value: counts.assets },
      { key: 'encounters', label: 'nav.items.encounters', value: counts.encounters },
      { key: 'maps', label: 'nav.items.maps', value: counts.maps },
      { key: 'templates', label: 'nav.items.templates', value: counts.templates },
    ].filter((row) => row.value > 0);
  });

  constructor() {
    // Nothing to confirm until a zip is picked.
    this.dialogRef.setStep({ okHidden: true });
    // The zone has the focus when the modal opens, like the Assets one.
    afterNextRender(() => this.zone()?.nativeElement.focus());
    // The name is the one thing to touch on the second step.
    effect(() => {
      const input = this.nameInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  protected skipReasonKey(reason: string): string {
    return `campaigns.import.skip.${SKIP_REASONS.includes(reason) ? reason : 'type'}`;
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      this.isDragOver.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) {
      return;
    }

    const zip = files.find((file) => file.name.toLowerCase().endsWith('.zip'));
    if (zip) {
      void this.scan(zip);
    } else {
      this.errorKey.set(REFUSAL_REASON['not-a-zip']);
    }
  }

  /** The system *Open* dialog, or the dropped `file`; shows the preview when the zip can be imported. */
  protected async scan(file?: File): Promise<void> {
    if (this.isBusy()) {
      return;
    }

    this.isBusy.set(true);
    this.errorKey.set(null);
    try {
      const result = await this.bundleService.scanImport(file);
      if (result.status === 'refused') {
        this.errorKey.set(REFUSAL_REASON[result.code] ?? 'notAZip');
      } else if (result.status === 'ready') {
        this.zipPath = result.path;
        this.preview.set(result.preview);
        this.name.set(result.preview.title.slice(0, NAME_MAX_LENGTH));
        this.step.set('review');
        this.dialogRef.setStep({
          description: this.translateService.instant('campaigns.import.reviewDescription'),
          okHidden: false,
          backText: this.translateService.instant('common.back'),
        });
      }
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.import.error.toast'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isBusy.set(false);
    }
  }

  /** Back to the drop zone; what was looked at is forgotten. */
  back(): void {
    if (this.isBusy() || this.step() !== 'review') {
      return;
    }

    this.step.set('pick');
    this.preview.set(null);
    this.zipPath = null;
    this.dialogRef.setStep({
      description: this.translateService.instant('campaigns.import.pickDescription'),
      okHidden: true,
      backText: null,
    });
  }

  /** The confirm button (and Enter in the name): creates the campaign from the zip the preview showed. */
  async confirm(): Promise<void> {
    const zipPath = this.zipPath;
    if (this.step() !== 'review' || !zipPath || this.isBusy()) {
      return;
    }
    if (this.isNameEmpty()) {
      this.nameInput()?.nativeElement.focus();
      return;
    }

    this.isBusy.set(true);
    const okText = this.translateService.instant('campaigns.import.submit');
    this.dialogRef.setOkText(this.translateService.instant('campaigns.import.importing'));
    try {
      const result = await this.bundleService.importCampaign(zipPath, this.name().trim());
      if (result.status === 'imported') {
        this.dialogRef.close();
        this.data.onImported(result.result);
        return;
      }

      // The zip changed since it was looked at, and is not one LazyDM takes any more: start again.
      this.isBusy.set(false);
      this.step.set('pick');
      this.preview.set(null);
      this.zipPath = null;
      this.errorKey.set(REFUSAL_REASON[result.code] ?? 'notAZip');
      this.dialogRef.setStep({
        description: this.translateService.instant('campaigns.import.pickDescription'),
        okHidden: true,
        backText: null,
      });
    } catch (error) {
      toast.error(this.translateService.instant('campaigns.import.error.toast'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isBusy.set(false);
      this.dialogRef.setOkText(okText);
    }
  }
}
