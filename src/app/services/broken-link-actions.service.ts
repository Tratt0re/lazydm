import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  parseVaultFilePath,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import { CAMPAIGN_SECTIONS } from '@/config/menu.config';
import { DocumentService } from '@/services/document.service';

/** What the actions need to know about a broken link. */
export interface BrokenLinkTarget {
  /** Note the link is written in. */
  readonly sourcePath: string;
  readonly raw: string;
  readonly targetName: string;
}

/**
 * Folders a note can be created in from a broken link. Encounters are linkable but are special files,
 * not plain notes, so they are left out until they get their own format.
 */
const NON_NOTE_SECTION_KEYS: readonly string[] = ['encounters'];
const NOTE_SECTIONS = CAMPAIGN_SECTIONS.filter(
  (section) => section.noteType !== null && !NON_NOTE_SECTION_KEYS.includes(section.key),
);

/** `ghost-note` → `Ghost note`; names with spaces are kept as written. */
function toSuggestedTitle(targetName: string): string {
  if (/\s/.test(targetName) || !targetName.includes('-')) {
    return targetName;
  }

  const words = targetName.split('-').filter(Boolean).join(' ');
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

/** Ways to fix a broken link: turn it into plain text, or create the note it points to. */
@Injectable({
  providedIn: 'root',
})
export class BrokenLinkActionsService {
  private readonly documentService = inject(DocumentService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);

  async removeLink(link: BrokenLinkTarget): Promise<void> {
    try {
      await this.documentService.unlink({ path: link.sourcePath, raw: link.raw });
      toast.success(this.translateService.instant('links.actions.removed'));
    } catch (error) {
      toast.error(this.translateService.instant('links.actions.removeError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Asks title and folder, creates the note, then opens it in the current tab. */
  openCreateSheet(link: BrokenLinkTarget): void {
    const sourceLocation = parseVaultFilePath(link.sourcePath);
    const scopePath = sourceLocation?.scopePath ?? link.sourcePath.split('/')[0];
    const sourceSection = sourceLocation?.section;
    const linkFolder = link.raw.split(/[|#]/)[0].split('/').slice(-2, -1)[0];
    const defaultSection =
      NOTE_SECTIONS.find((section) => section.key === linkFolder) ??
      NOTE_SECTIONS.find((section) => section.key === sourceSection) ??
      NOTE_SECTIONS[0];

    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('links.actions.createTitle'),
      arcDescription: this.translateService.instant('links.actions.createDescription', {
        link: link.raw,
      }),
      arcOkText: this.translateService.instant('links.actions.createSubmit'),
      arcCancelText: this.translateService.instant('links.actions.cancel'),
      fields: [
        {
          id: 'title',
          type: 'input',
          label: 'links.actions.titleLabel',
          value: toSuggestedTitle(link.targetName),
          required: true,
          translate: true,
        },
        {
          id: 'section',
          type: 'select',
          label: 'links.actions.folderLabel',
          value: defaultSection.key,
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
            NOTE_SECTIONS.find((item) => item.key === values['section']) ?? defaultSection;
          void this.createNote(
            link,
            scopePath,
            section.key,
            section.noteType ?? '',
            String(values['title'] ?? ''),
          ).then((isCreated) => {
            isSubmitting = false;
            if (isCreated) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  private async createNote(
    link: BrokenLinkTarget,
    scopePath: string,
    sectionKey: string,
    type: string,
    title: string,
  ): Promise<boolean> {
    try {
      const created = await this.documentService.createFromLink({
        sourcePath: link.sourcePath,
        raw: link.raw,
        folder: `${scopePath}/${sectionKey}`,
        title,
        type,
        section: this.translateService.instant(`nav.items.${sectionKey}`),
      });
      toast.success(
        this.translateService.instant('links.actions.created', { title: created.title }),
      );

      const route = toInAppNoteRoute(created.path);
      if (route) {
        await this.router.navigateByUrl(route);
      }

      return true;
    } catch (error) {
      toast.error(this.translateService.instant('links.actions.createError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
