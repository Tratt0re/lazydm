import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { toInAppNoteRoute } from '@/components/document-preview/document-preview.markdown';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { ReviewDto, ReviewMisplacedNoteDto, ReviewNoteDto, ReviewPlacedNoteDto } from '@/dtos';
import { BrokenLinksPage } from '@/pages/broken-links-page/broken-links-page';
import { DocumentService } from '@/services/document.service';
import { FileActionsService } from '@/services/file-actions.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { countReviewItems, ReviewService } from '@/services/review.service';
import { CUSTOM_SECTION_ICONS, SectionService, toSubfolderLabel } from '@/services/section.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

export const REVIEW_ROUTE_SEGMENT = 'review';

const INDEX_UPDATED_EVENT = 'index:updated';
/** Paths a *Fix all* confirmation lists before "and N more". */
const FIX_ALL_PREVIEW_MAX = 8;
/** Encounters are linkable special files, not a folder to move notes to. */
const NON_NOTE_SECTION_KEYS: readonly string[] = ['encounters'];

/** A planned frontmatter fix: the type and sub-type a note gets. */
interface TypeFix {
  readonly note: ReviewNoteDto;
  readonly type: string;
  readonly subtype: string | null;
}

/**
 * The Review page of a campaign or system: every disagreement between its files and its sections (broken
 * links, misplaced notes, wrong sub-types, notes without a type or outside any section, unknown and too
 * deep folders), each with the fixes the user can choose. Follows index updates.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-review-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslatePipe,
    BrokenLinksPage,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechTooltipImports,
  ],
  templateUrl: './review-page.html',
})
export class ReviewPage {
  protected readonly scope = inject(NoteScopeService).scopeOf(
    getNoteScopeKind(inject(ActivatedRoute)),
  );
  private readonly reviewService = inject(ReviewService);
  private readonly documentService = inject(DocumentService);
  private readonly fileActions = inject(FileActionsService);
  private readonly sectionService = inject(SectionService);
  private readonly workspace = inject(WorkspaceService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);
  private loadToken = 0;

  protected readonly review = signal<ReviewDto | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  /** A fix is being written: the buttons wait for it. */
  protected readonly isFixing = signal(false);
  protected readonly isClean = computed(() => {
    const review = this.review();
    return review !== null && countReviewItems(review) === 0;
  });
  protected readonly toSubfolderLabel = toSubfolderLabel;

  private readonly handleIndexUpdated = () => this.reload();

  constructor() {
    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      onCleanup(
        this.toolbarContext.activate({
          title: 'review.title',
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [{ label: scope.name, path: scope.routeBase, translate: false }],
        }),
      );
      void this.load(scope.rootPath);
    });

    window.electronAPI?.onIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated);
    inject(DestroyRef).onDestroy(() =>
      window.electronAPI?.offIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated),
    );
  }

  protected noteRoute(note: ReviewNoteDto): string | null {
    return toInAppNoteRoute(note.path);
  }

  /** Display name of a section of this scope by folder. */
  protected sectionLabel(key: string): string {
    return this.sectionService.labelOfKey(key, this.scope()?.kind ?? 'campaign');
  }

  /** Display name of the section a note type belongs to (its type as written when none has it). */
  protected typeLabel(type: string | null): string {
    const key = this.noteSections().find((section) => section.type === type)?.key;
    return key ? this.sectionLabel(key) : (type ?? '');
  }

  /** `Enemies` or `Enemies / Humans`. */
  protected placeLabel(note: ReviewPlacedNoteDto): string {
    const section = this.sectionLabel(note.section);
    return note.subfolder ? `${section} / ${toSubfolderLabel(note.subfolder)}` : section;
  }

  // --- Deleting what the review lists -------------------------------------------------------------

  /** Delete a note the review lists (to the system Trash, after the usual confirmation); the review reloads. */
  protected openDeleteNoteSheet(note: ReviewNoteDto): void {
    void this.fileActions.openDeleteSheet(
      { path: note.path, label: note.title, isNote: true },
      () => this.reload(),
    );
  }

  /**
   * Delete a folder the review lists (an unknown folder, or one nested too deep) with its files: to the system
   * Trash, after a confirmation with the file count; links to its files become plain text unless unticked.
   */
  protected openDeleteFolderSheet(folder: string, fileCount: number): void {
    const name = folder.split('/').pop() ?? folder;
    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('review.delete.folderTitle', { name }),
      arcDescription: this.translateService.instant('review.delete.folderDescription', {
        folder: `${name}/`,
        count: fileCount,
      }),
      arcOkText: this.translateService.instant('files.delete.submit'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('review.cancel'),
      fields: [
        {
          id: 'rewriteLinks',
          type: 'checkbox',
          value: true,
          checkboxLabel: this.translateService.instant('files.deleteFolder.rewriteLinks'),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const rewriteLinks = form.getValues()['rewriteLinks'] !== false;
          void this.deleteFolder(folder, name, rewriteLinks).then((isDeleted) => {
            isSubmitting = false;
            if (isDeleted) {
              dialogRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  private async deleteFolder(
    folder: string,
    name: string,
    rewriteLinks: boolean,
  ): Promise<boolean> {
    try {
      const result = await this.documentService.deleteStrayFolder(folder, rewriteLinks);
      await this.fileActions.followDeletedFolder(result.deleted);
      toast.success(this.translateService.instant('files.deleteFolder.done', { name }), {
        description:
          result.linkCount > 0
            ? this.translateService.instant('files.delete.linksUpdated', {
                links: result.linkCount,
                notes: result.updatedPaths.length,
              })
            : undefined,
      });
      if (result.failedPaths.length > 0) {
        toast.warning(this.translateService.instant('document.rename.failed'), {
          description: result.failedPaths.join(', '),
        });
      }

      this.reload();
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('files.deleteFolder.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // --- Single fixes --------------------------------------------------------------------------------

  /** Frontmatter matches the folder: the folder's type and sub-type. */
  protected matchFolder(note: ReviewPlacedNoteDto): void {
    void this.applyTypeFixes([this.folderFix(note)]);
  }

  /** Misplaced: the note goes to the section of its type. */
  protected moveToTypeSection(note: ReviewMisplacedNoteDto): void {
    const scope = this.scope();
    if (scope && note.typeSection) {
      void this.moveNote(note, `${scope.rootPath}/${note.typeSection}`);
    }
  }

  /** Wrong sub-type: the note goes to the sub-folder its sub-type names. */
  protected moveToSubtypeFolder(note: ReviewPlacedNoteDto): void {
    const scope = this.scope();
    if (scope && note.subtype) {
      void this.moveNote(note, `${scope.rootPath}/${note.section}/${note.subtype}`);
    }
  }

  /** Outside any section: the user picks the section. */
  protected openMoveSheet(note: ReviewNoteDto): void {
    const scope = this.scope();
    const sections = this.noteSections();
    if (!scope || sections.length === 0) {
      return;
    }

    const preferred = sections.find((section) => section.type === note.type) ?? sections[0];
    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('review.move.title', { title: note.title }),
      arcDescription: this.translateService.instant('review.move.description'),
      arcOkText: this.translateService.instant('review.move.submit'),
      arcCancelText: this.translateService.instant('review.cancel'),
      fields: [
        {
          id: 'section',
          type: 'select',
          label: 'review.move.sectionLabel',
          value: preferred.key,
          required: true,
          translate: true,
          options: sections.map((section) => ({
            value: section.key,
            label: this.sectionService.labelOf(section),
            icon: section.icon,
            translate: false,
          })),
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const key = String(form.getValues()['section'] ?? preferred.key);
          void this.moveNote(note, `${scope.rootPath}/${key}`).then((isMoved) => {
            isSubmitting = false;
            if (isMoved) {
              dialogRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  /** Unknown folder of a campaign: becomes a custom section (its folder keeps its name). */
  protected openAddSectionSheet(folder: string): void {
    const scope = this.scope();
    if (scope?.kind !== 'campaign') {
      return;
    }

    let isSubmitting = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant('review.addSection.title', { folder: `${folder}/` }),
      arcDescription: this.translateService.instant('review.addSection.description'),
      arcOkText: this.translateService.instant('review.addSection.submit'),
      arcCancelText: this.translateService.instant('review.cancel'),
      fields: [
        {
          id: 'label',
          type: 'input',
          label: 'settings.campaignSections.create.nameLabel',
          value: toSubfolderLabel(folder),
          required: true,
          translate: true,
        },
        {
          id: 'icon',
          type: 'select',
          label: 'settings.campaignSections.create.iconLabel',
          value: CUSTOM_SECTION_ICONS[0],
          required: true,
          translate: true,
          options: CUSTOM_SECTION_ICONS.map((icon) => ({
            value: icon,
            label: `settings.campaignSections.icons.${icon}`,
            icon,
            translate: true,
          })),
        },
        {
          id: 'type',
          type: 'input',
          label: 'settings.campaignSections.create.typeLabel',
          placeholder: 'settings.campaignSections.create.typePlaceholder',
          description: 'settings.campaignSections.create.typeDescription',
          value: folder,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          const values = form.getValues();
          void this.addSection(scope.rootPath, {
            key: folder,
            label: String(values['label'] ?? '').trim(),
            type: String(values['type'] ?? '').trim() || undefined,
            icon: String(values['icon'] ?? CUSTOM_SECTION_ICONS[0]),
          }).then((isAdded) => {
            isSubmitting = false;
            if (isAdded) {
              dialogRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  // --- Fix all -------------------------------------------------------------------------------------

  /** Every note of a group gets the type and sub-type of its folder, after a preview of what is written. */
  protected confirmFixAll(notes: readonly ReviewPlacedNoteDto[]): void {
    const fixes = notes.map((note) => this.folderFix(note));
    const preview = fixes
      .slice(0, FIX_ALL_PREVIEW_MAX)
      .map(
        (fix) =>
          `• ${fix.note.path} → type: ${fix.type}${fix.subtype ? `, subtype: ${fix.subtype}` : ''}`,
      )
      .join('\n');
    const more = fixes.length - FIX_ALL_PREVIEW_MAX;

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('review.fixAll.title', { count: fixes.length }),
      arcDescription: `${this.translateService.instant('review.fixAll.description')}\n\n${preview}${
        more > 0 ? `\n${this.translateService.instant('review.fixAll.more', { count: more })}` : ''
      }`,
      arcOkText: this.translateService.instant('review.fixAll.confirm'),
      arcCancelText: this.translateService.instant('review.cancel'),
      arcOnOk: () => {
        void this.applyTypeFixes(fixes);
      },
    });
  }

  // --- Internals -----------------------------------------------------------------------------------

  /** Sections of this scope notes can be moved to. */
  private noteSections() {
    const scope = this.scope();
    const sections =
      scope?.kind === 'system'
        ? this.sectionService.systemSections()
        : this.sectionService.campaignSections();
    return sections.filter(
      (section) => section.type !== null && !NON_NOTE_SECTION_KEYS.includes(section.key),
    );
  }

  private folderFix(note: ReviewPlacedNoteDto): TypeFix {
    return { note, type: note.sectionType, subtype: note.subfolder };
  }

  private async applyTypeFixes(fixes: readonly TypeFix[]): Promise<void> {
    this.isFixing.set(true);
    const failed: string[] = [];
    for (const fix of fixes) {
      try {
        await this.documentService.setType(fix.note.path, fix.type, fix.subtype);
      } catch (error) {
        console.warn('[app] Review fix failed:', fix.note.path, error);
        failed.push(fix.note.path);
      }
    }

    this.isFixing.set(false);
    this.reportFixes(fixes.length - failed.length, failed);
    this.reload();
  }

  private async moveNote(note: ReviewNoteDto, folder: string): Promise<boolean> {
    this.isFixing.set(true);
    try {
      const result = await this.documentService.move(note.path, folder);
      const oldRoute = toInAppNoteRoute(note.path);
      const newRoute = toInAppNoteRoute(result.path);
      if (oldRoute && newRoute) {
        await this.workspace.replaceUrl(oldRoute, newRoute);
      }

      toast.success(
        this.translateService.instant('review.move.done', {
          title: note.title,
          links: result.linkCount,
        }),
        result.failedPaths.length > 0
          ? {
              description: this.translateService.instant('review.move.failedLinks', {
                paths: result.failedPaths.join(', '),
              }),
            }
          : undefined,
      );
      this.reload();
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('review.move.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      this.isFixing.set(false);
    }
  }

  private async addSection(
    campaign: string,
    section: { key: string; label: string; type?: string; icon: string },
  ): Promise<boolean> {
    try {
      await this.sectionService.addCustomSection(campaign, section);
      toast.success(
        this.translateService.instant('review.addSection.done', { name: section.label }),
      );
      this.reload();
      return true;
    } catch (error) {
      toast.error(this.translateService.instant('settings.campaignSections.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private reportFixes(fixedCount: number, failedPaths: readonly string[]): void {
    if (failedPaths.length === 0) {
      toast.success(this.translateService.instant('review.fixed', { count: fixedCount }));
      return;
    }

    toast.error(this.translateService.instant('review.fixFailed', { count: failedPaths.length }), {
      description: failedPaths.join(', '),
    });
  }

  private reload(): void {
    const scope = this.scope();
    if (scope) {
      void this.load(scope.rootPath);
    }
  }

  private async load(scopePath: string): Promise<void> {
    const token = ++this.loadToken;
    this.errorMessage.set(null);

    try {
      const review = await this.reviewService.list(scopePath);
      if (token === this.loadToken) {
        this.review.set(review);
      }
    } catch (error) {
      if (token === this.loadToken) {
        this.errorMessage.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (token === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }
}
