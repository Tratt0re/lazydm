import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import type { CodeEditorAssetAction } from '@/components/code-editor/code-editor.component';
import { AppDocumentPreviewComponent } from '@/components/document-preview/document-preview.component';
import type { MediaEmbedLabels } from '@/components/document-preview/document-preview.markdown';
import { AppLinkPreviewCardComponent } from '@/components/link-preview-card/link-preview-card.component';
import type { DocumentDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';
import { FileMoveService } from '@/services/file-move.service';
import { NoteAudioService } from '@/services/note-audio.service';
import { ARC_SHEET_DATA, ArcTechSheetRef } from '@/shared/components/sheet';
import type { LinkPreviewRequest } from '@/components/link-preview-card/link-preview-hover';

/**
 * Content of the side sheet that shows an entity's linked note: the note in Reading, as on its page (links,
 * embeds, audio and link previews work). A link opens its note and closes the sheet; the sheet's own footer
 * button opens the note too. Read-only.
 */
@Component({
  selector: 'app-encounter-note-panel',
  imports: [TranslatePipe, AppDocumentPreviewComponent, AppLinkPreviewCardComponent],
  template: `
    @if (hasError()) {
      <p class="p-4 text-xs leading-5 text-destructive">{{ 'encounters.note.loadError' | translate }}</p>
    } @else if (document(); as note) {
      <div class="relative h-full min-h-0">
        <app-document-preview
          class="h-full"
          [body]="note.body"
          [links]="note.links"
          [sourcePath]="note.path"
          [playingAudioPath]="noteAudio.playingPath()"
          [audioProgress]="noteAudio.progress()"
          [audioVolume]="noteAudio.volume()"
          [audioDurations]="noteAudio.durations()"
          [mediaLabels]="mediaLabels"
          [linkPreviewLabel]="linkPreviewLabel"
          [imagePreviewLabel]="imagePreviewLabel"
          (assetAction)="onAssetAction($event)"
          (linkPreview)="toggleLinkPreview($event)"
          (click)="onLinkClick($event)"
        />
        <app-link-preview-card />
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0' },
})
export class AppEncounterNotePanelComponent {
  private readonly documentService = inject(DocumentService);
  private readonly fileMove = inject(FileMoveService);
  private readonly translateService = inject(TranslateService);
  protected readonly noteAudio = inject(NoteAudioService);
  /** The note to show (vault path), handed over by the sheet. */
  private readonly data = inject<{ readonly path: string }>(ARC_SHEET_DATA);
  private readonly router = inject(Router);
  private readonly sheetRef = inject<ArcTechSheetRef>(ArcTechSheetRef);
  private readonly previewCard = viewChild(AppLinkPreviewCardComponent);
  private loadToken = 0;

  protected readonly document = signal<DocumentDto | null>(null);
  protected readonly hasError = signal(false);
  protected readonly mediaLabels: MediaEmbedLabels = {
    play: this.translateService.instant('document.media.play'),
    open: this.translateService.instant('document.media.open'),
    volume: this.translateService.instant('document.media.volume'),
  };
  protected readonly linkPreviewLabel = this.translateService.instant('document.linkPreview.show');
  protected readonly imagePreviewLabel = this.translateService.instant('document.linkPreview.showImage');

  constructor() {
    void this.load(this.data.path);
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;

    try {
      const note = await this.documentService.read(path);
      if (token === this.loadToken) {
        this.document.set(note);
      }
    } catch (error) {
      console.warn('[app] Failed to load the entity note:', path, error);
      if (token === this.loadToken) {
        this.hasError.set(true);
      }
    }
  }

  /** A note link (or a file) opens its page and closes the sheet; the preview's own clicks are left to it. */
  protected onLinkClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a[data-route]');
    const route = anchor?.getAttribute('data-route');
    if (route) {
      event.preventDefault();
      this.sheetRef.close();
      void this.router.navigateByUrl(route);
    }
  }

  /** The audio channel and the PDF rows of the note, as on the note page. */
  protected onAssetAction(event: CodeEditorAssetAction): void {
    if (event.action === 'set-volume') {
      this.noteAudio.setVolume(event.volume ?? 1);
      return;
    }

    const { action, path } = event;
    if (action === 'toggle-audio') {
      this.noteAudio.toggle(path).catch((error: unknown) =>
        toast.error(this.translateService.instant('document.media.playError'), {
          description: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }

    this.documentService.openFile(path).catch((error: unknown) =>
      toast.error(this.translateService.instant('document.media.openError'), {
        description: error instanceof Error ? error.message : String(error),
        action: {
          label: this.translateService.instant(this.fileMove.revealLabel),
          onClick: () => this.fileMove.reveal(path),
        },
      }),
    );
  }

  /** The eye button of a note link: its preview card (pressed again for the same note, it closes). */
  protected toggleLinkPreview({ kind, anchor, path, route }: LinkPreviewRequest): void {
    const card = this.previewCard();
    if (card?.isShowing(path)) {
      card.close();
    } else if (kind === 'image') {
      card?.showImage(anchor, path);
    } else {
      void card?.show(anchor, path, route);
    }
  }
}
