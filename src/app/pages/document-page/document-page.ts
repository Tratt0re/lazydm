import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { toast } from 'ngx-sonner';

import { AppBrokenLinkMenuComponent } from '@/components/broken-link-menu/broken-link-menu.component';
import {
  AppCodeEditorComponent,
  type CodeEditorAssetAction,
  type CodeEditorBrokenLinkEvent,
} from '@/components/code-editor/code-editor.component';
import {
  AppDocumentLinksPanelComponent,
  type BrokenLinkFixRequest,
} from '@/components/document-links-panel/document-links-panel.component';
import { AppDocumentPreviewComponent } from '@/components/document-preview/document-preview.component';
import {
  type MediaEmbedLabels,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import type { DocumentDto, DocumentLinkDto, LinkTargetDto, SavedAssetDto } from '@/dtos';
import { AssetService, NOTE_AUDIO_MAX_SECONDS } from '@/services/asset.service';
import { resolveDocumentLinks } from '@/components/code-editor/resolve-links';
import { FileActionsService } from '@/services/file-actions.service';
import { FileMoveService } from '@/services/file-move.service';
import { NoteAudioService } from '@/services/note-audio.service';
import { BrokenLinkActionsService } from '@/services/broken-link-actions.service';
import { CopyToService } from '@/services/copy-to.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { DocumentService } from '@/services/document.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import type { DocumentViewMode } from '@/config/local-preferences.config';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ToolbarContextService } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import type { ArcTechSheetRef } from '@/shared/components/sheet';
import { ArcTechSheetService } from '@/shared/components/sheet';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

export const DOCUMENT_NOTE_PARAM = 'note';
/** Sub-folder of the section the note is in (its sub-type), when it is in one. */
export const DOCUMENT_SUBFOLDER_PARAM = 'subfolder';

const FRONTMATTER_FENCE_PATTERN = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n?/;

/** Strips the YAML header for display only; no field parsing happens on the frontend. */
function stripFrontmatterFence(content: string): string {
  return content.replace(FRONTMATTER_FENCE_PATTERN, '');
}

const INDEX_UPDATED_EVENT = 'index:updated';

const EDITOR_MODES: readonly { value: DocumentViewMode; label: string; icon: ArcTechIcon }[] = [
  { value: 'live', label: 'document.toolbar.live', icon: 'pencil-line' },
  { value: 'source', label: 'document.toolbar.source', icon: 'code' },
  { value: 'reading', label: 'document.toolbar.reading', icon: 'book-open' },
];

@Component({
  selector: 'app-document-page',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechTooltipImports,
    AppBrokenLinkMenuComponent,
    AppCodeEditorComponent,
    AppDocumentLinksPanelComponent,
    AppDocumentPreviewComponent,
  ],
  templateUrl: './document-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class DocumentPage {
  private readonly route = inject(ActivatedRoute);
  /** A campaign, or a compendium system (the same page edits notes of both). */
  protected readonly scope = inject(NoteScopeService).scopeOf(getNoteScopeKind(this.route));
  private readonly router = inject(Router);
  private readonly documentService = inject(DocumentService);
  private readonly sectionService = inject(SectionService);
  private readonly sheetService = inject(ArcTechSheetService);
  private readonly translateService = inject(TranslateService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly localPreferences = inject(LocalPreferencesService);
  private readonly workspace = inject(WorkspaceService);
  private readonly brokenLinkActions = inject(BrokenLinkActionsService);
  private readonly copyTo = inject(CopyToService);
  private readonly assetService = inject(AssetService);
  private readonly fileActions = inject(FileActionsService);
  private readonly fileMove = inject(FileMoveService);
  /** The note audio channel: one sound at a time, stopped when the note changes or the page goes. */
  protected readonly noteAudio = inject(NoteAudioService);
  protected readonly mediaLabels: MediaEmbedLabels = {
    play: this.translateService.instant('document.media.play'),
    open: this.translateService.instant('document.media.open'),
    volume: this.translateService.instant('document.media.volume'),
  };
  private readonly editor = viewChild(AppCodeEditorComponent);
  private readonly brokenLinkMenu = viewChild(AppBrokenLinkMenuComponent);
  private loadToken = 0;
  private unregisterOpenNote: (() => void) | null = null;

  private readonly sectionKey = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(CAMPAIGN_SECTION_PARAM) ?? '')),
    { initialValue: '' },
  );
  private readonly noteSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(DOCUMENT_NOTE_PARAM) ?? '')),
    { initialValue: '' },
  );

  private readonly subfolder = toSignal(
    this.route.paramMap.pipe(map((params) => params.get(DOCUMENT_SUBFOLDER_PARAM))),
    { initialValue: null },
  );

  protected readonly notePath = computed(() => {
    const folder = this.subfolder()
      ? `${this.sectionKey()}/${this.subfolder()}`
      : this.sectionKey();
    return `${this.scope()?.rootPath ?? ''}/${folder}/${this.noteSlug()}.md`;
  });

  protected readonly document = signal<DocumentDto | null>(null);
  protected readonly editedContent = signal('');
  protected readonly mode = signal<DocumentViewMode>('live');
  /** Editor views, switched by the toggle buttons above the editor (Source only when enabled in Settings). */
  protected readonly editorModes = computed(() =>
    EDITOR_MODES.filter(
      (option) => option.value !== 'source' || this.localPreferences.editorSettings().showSourceView,
    ),
  );
  /** Links the live editor resolves with; refreshed when the vault index re-reads this note. */
  protected readonly editorLinks = signal<readonly DocumentLinkDto[]>([]);
  /** Files of the note's scope the editor suggests while a link is typed; refreshed with the index. */
  protected readonly linkTargets = signal<readonly LinkTargetDto[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isLinksPanelOpen = signal(this.localPreferences.getDocumentLinksPanelOpen());

  protected readonly isDirty = computed(
    () => this.document() !== null && this.editedContent() !== this.document()!.content,
  );
  protected readonly previewBody = computed(() => stripFrontmatterFence(this.editedContent()));
  /**
   * The links of the text being edited, resolved against the files of the note's scope, so links typed or
   * pasted show up right away (Live and Reading); the index's links fill in what that list cannot answer.
   */
  protected readonly liveLinks = computed(() =>
    resolveDocumentLinks(
      this.editedContent(),
      this.document()?.path ?? '',
      this.linkTargets(),
      this.editorLinks(),
    ),
  );

  constructor() {
    window.electronAPI?.onIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated);
    inject(DestroyRef).onDestroy(() => {
      window.electronAPI?.offIpcEvent?.(INDEX_UPDATED_EVENT, this.handleIndexUpdated);
      this.unregisterOpenNote?.();
      this.noteAudio.stop();
    });

    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      const scopePath = scope.routeBase;
      onCleanup(
        this.toolbarContext.activate({
          title: this.document()?.title ?? this.noteSlug(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: scope.name, path: scopePath, translate: false },
            {
              label: this.sectionService.labelOfKey(this.sectionKey(), scope.kind),
              path: `${scopePath}/${this.sectionKey()}`,
              translate: false,
            },
            ...this.subfolderBreadcrumbs(`${scopePath}/${this.sectionKey()}`),
          ],
          itemActions: [
            {
              id: 'links',
              label: this.translateService.instant('document.toolbar.links'),
              icon: 'panel-right',
              buttonType: 'outline',
              iconOnly: true,
              action: () => this.toggleLinksPanel(),
            },
            {
              id: 'copy',
              label: this.translateService.instant(
                scope.kind === 'system'
                  ? 'compendium.copy.toCampaign'
                  : 'compendium.copy.toCompendium',
              ),
              icon: 'copy-plus',
              buttonType: 'outline',
              iconOnly: true,
              disabled: () => !this.document() || this.isSaving(),
              action: () => this.copyToOtherScope(),
            },
            {
              id: 'rename',
              label: this.translateService.instant('document.toolbar.rename'),
              icon: 'text-cursor-input',
              buttonType: 'outline',
              iconOnly: true,
              disabled: () => !this.document() || this.isSaving(),
              action: () => this.openRenameSheet(),
            },
            {
              id: 'delete',
              label: this.translateService.instant('files.delete.menu'),
              icon: 'trash',
              buttonType: 'outline',
              iconOnly: true,
              disabled: () => !this.document() || this.isSaving(),
              action: () => this.openDeleteSheet(),
            },
            {
              id: 'save',
              label: this.translateService.instant('document.toolbar.save'),
              icon: 'save',
              iconOnly: true,
              disabled: () => !this.isDirty() || this.isSaving(),
              action: async () => {
                await this.save();
              },
            },
          ],
        }),
      );
    });

    effect(() => {
      void this.loadDocument(this.notePath());
    });

    // Hiding the Source view (Settings → Editor) moves a note shown in Source to Live.
    effect(() => {
      if (!this.localPreferences.editorSettings().showSourceView && this.mode() === 'source') {
        this.mode.set('live');
      }
    });
  }

  /** The sub-folder crumb (`CAMPAIGN / ENEMIES / HUMANS /`): the section page showing that sub-folder. */
  private subfolderBreadcrumbs(sectionPath: string) {
    const subfolder = this.subfolder();
    return subfolder
      ? [
          {
            label: toSubfolderLabel(subfolder),
            path: sectionPath,
            queryParams: { folder: subfolder },
            translate: false,
          },
        ]
      : [];
  }

  /** Autosave when leaving the note (tab switch, link, sidebar); a conflict or error keeps the user here. */
  async saveBeforeLeave(): Promise<boolean> {
    // A note deleted while shown (here or from the explorer) is not written back.
    const document = this.document();
    if (document && this.fileActions.isDeleted(document.path)) {
      return true;
    }

    return !this.isDirty() || (await this.save());
  }

  protected async save(): Promise<boolean> {
    const document = this.document();
    if (!document || this.isSaving()) {
      return false;
    }

    this.isSaving.set(true);
    try {
      const result = await this.documentService.write({
        path: document.path,
        content: this.editedContent(),
        expectedHash: document.contentHash,
      });

      if (result.status === 'saved') {
        this.document.set(await this.documentService.read(document.path));
        toast.success(this.translateService.instant('document.toast.saved'));
        return true;
      }

      this.openConflictSheet(result.current);
      return false;
    } catch (error) {
      toast.error(this.translateService.instant('document.toast.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Pasted media files are saved right away in the scope's assets and embedded at the cursor. */
  protected onFilesPasted(files: readonly File[]): void {
    const document = this.document();
    if (document) {
      void this.saveAssets(document.path, async () => {
        const saved: SavedAssetDto[] = [];
        for (const file of files) {
          saved.push(await this.assetService.save({ sourcePath: document.path }, file));
        }
        return saved;
      });
    }
  }

  /** *Import file…* (insert menu): media files picked on disk, saved and embedded like a paste. */
  protected importFiles(): void {
    const document = this.document();
    if (document) {
      void this.saveAssets(document.path, () =>
        this.assetService.importFiles({ sourcePath: document.path }),
      );
    }
  }

  /**
   * Saves assets, embeds them in the note (unless another note was opened meanwhile), says where they
   * went, and warns about audio longer than note audio is meant for.
   */
  private async saveAssets(
    notePath: string,
    saveFiles: () => Promise<readonly SavedAssetDto[]>,
  ): Promise<void> {
    let saved: readonly SavedAssetDto[];
    try {
      saved = await saveFiles();
    } catch (error) {
      toast.error(this.translateService.instant('document.assets.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (saved.length === 0) {
      return;
    }

    if (this.document()?.path === notePath) {
      this.editor()?.insertEmbeds(saved.map((asset) => asset.linkTarget));
    }
    // Files identical to an asset already there were not saved again: that one is linked instead.
    const titleKey = saved.every((asset) => asset.isReused)
      ? 'document.assets.reused'
      : saved.length === 1
        ? 'document.assets.savedOne'
        : 'document.assets.savedMany';
    toast.success(this.translateService.instant(titleKey, { count: saved.length }), {
      description: saved.map((asset) => asset.path).join(', '),
    });

    for (const asset of saved.filter((item) => item.kind === 'audio')) {
      const duration = await this.assetService.readAudioDuration(asset.path);
      if (duration !== null && duration > NOTE_AUDIO_MAX_SECONDS) {
        toast.warning(
          this.translateService.instant('document.assets.longAudio', {
            name: asset.linkTarget,
            seconds: NOTE_AUDIO_MAX_SECONDS,
          }),
          { description: this.translateService.instant('document.assets.longAudioDescription') },
        );
      }
    }
  }

  /** Copies the note to the compendium (from a campaign) or to a campaign (from a system); saved first. */
  protected async copyToOtherScope(): Promise<void> {
    const document = this.document();
    if (document && (!this.isDirty() || (await this.save()))) {
      await this.copyTo.openCopySheet(document.path);
    }
  }

  /** Live / Source / Reading, remembered for this note on this device. */
  protected setMode(mode: DocumentViewMode): void {
    this.mode.set(mode);
    const document = this.document();
    if (document) {
      this.localPreferences.setDocumentViewMode(document.path, mode);
    }
  }

  protected openRoute(route: string): void {
    void this.router.navigateByUrl(route);
  }

  /**
   * An embedded audio's play/stop (the note audio channel) or a PDF's row (the system viewer; without an app
   * for it, the error offers *Reveal*).
   */
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

  protected openBrokenLinkMenu(event: CodeEditorBrokenLinkEvent): void {
    this.brokenLinkMenu()?.open(event.raw, event.targetName, event.x, event.y);
  }

  /** The vault index changed (this note, or a note its links point to): re-resolve the editor links. */
  private readonly handleIndexUpdated = () => {
    const document = this.document();
    if (!document) {
      return;
    }

    this.documentService
      .links(document.path)
      .then((links) => {
        if (this.document()?.path === document.path) {
          this.editorLinks.set([...links.outgoingLinks, ...links.brokenLinks]);
        }
      })
      .catch((error: unknown) => console.warn('[app] Failed to refresh note links:', error));
    this.loadLinkTargets(document.path);
  };

  private loadLinkTargets(notePath: string): void {
    this.documentService
      .linkTargets(notePath)
      .then((targets) => {
        if (this.document()?.path === notePath) {
          this.linkTargets.set(targets);
        }
      })
      .catch((error: unknown) => console.warn('[app] Failed to load link suggestions:', error));
  }

  protected toggleLinksPanel(): void {
    const isOpen = !this.isLinksPanelOpen();
    this.isLinksPanelOpen.set(isOpen);
    this.localPreferences.setDocumentLinksPanelOpen(isOpen);
  }

  /** Fixing a link rewrites this note on disk: pending edits are saved first, the editor reloads after. */
  protected async onFixBrokenLink({ action, link }: BrokenLinkFixRequest): Promise<void> {
    const document = this.document();
    if (!document || (this.isDirty() && !(await this.save()))) {
      return;
    }

    const target = { sourcePath: document.path, raw: link.raw, targetName: link.targetName };
    if (action === 'create') {
      this.brokenLinkActions.openCreateSheet(target);
      return;
    }

    await this.brokenLinkActions.removeLink(target);
    const reloaded = await this.documentService.read(document.path);
    this.document.set(reloaded);
    this.editedContent.set(reloaded.content);
    this.editor()?.replaceContent(reloaded.content);
  }

  /**
   * *Delete…* the note (to the system Trash), after a confirmation. Its unsaved edits are dropped (leaving a
   * deleted note does not save it); campaign tabs go to the folder page, a system page navigates there.
   */
  protected openDeleteSheet(): void {
    const document = this.document();
    if (!document) {
      return;
    }

    void this.fileActions.openDeleteSheet(
      { path: document.path, label: document.title, isNote: true },
      (folderRoute) => {
        if (folderRoute && this.scope()?.kind === 'system') {
          void this.router.navigateByUrl(folderRoute, { replaceUrl: true });
        }
      },
    );
  }

  /**
   * Rename with a preview of the notes linking here (the shared sheet; unsaved edits are saved first). The
   * view mode follows the note; a system page navigates to the new URL, an unchanged URL reloads the note.
   */
  protected openRenameSheet(): void {
    const document = this.document();
    if (!document) {
      return;
    }

    void this.fileActions.openRenameNoteSheet(
      { path: document.path, title: document.title },
      async (newPath) => {
        this.localPreferences.setDocumentViewMode(newPath, this.mode());
        const oldRoute = toInAppNoteRoute(document.path);
        const newRoute = toInAppNoteRoute(newPath);
        if (oldRoute && newRoute && oldRoute !== newRoute) {
          if (this.scope()?.kind === 'system') {
            await this.router.navigateByUrl(newRoute, { replaceUrl: true });
          }
          return;
        }

        const renamed = await this.documentService.read(newPath);
        this.document.set(renamed);
        this.editedContent.set(renamed.content);
        this.editor()?.replaceContent(renamed.content);
      },
    );
  }

  private openConflictSheet(current: DocumentDto): void {
    let isBusy = false;

    const sheetRef: ArcTechSheetRef = this.sheetService.create({
      arcTitle: this.translateService.instant('document.conflict.title'),
      arcContent: this.translateService.instant('document.conflict.description'),
      arcOkText: this.translateService.instant('document.conflict.keepMine'),
      arcOkDestructive: true,
      arcMiddleText: this.translateService.instant('document.conflict.saveCopy'),
      arcCancelText: this.translateService.instant('document.conflict.reload'),
      arcOnOk: () => {
        if (!isBusy) {
          isBusy = true;
          void this.forceOverwrite(current).finally(() => {
            isBusy = false;
            sheetRef.close();
          });
        }
        return false;
      },
      arcOnMiddle: () => {
        if (!isBusy) {
          isBusy = true;
          void this.saveAsCopy().finally(() => {
            isBusy = false;
            sheetRef.close();
          });
        }
        return false;
      },
      arcOnCancel: () => {
        this.document.set(current);
        this.editedContent.set(current.content);
        this.editor()?.replaceContent(current.content);
      },
    });
  }

  private async forceOverwrite(current: DocumentDto): Promise<void> {
    try {
      const result = await this.documentService.write({
        path: current.path,
        content: this.editedContent(),
        expectedHash: current.contentHash,
      });

      if (result.status === 'saved') {
        this.document.set(await this.documentService.read(current.path));
        toast.success(this.translateService.instant('document.toast.saved'));
      } else {
        toast.error(this.translateService.instant('document.toast.saveError'));
      }
    } catch (error) {
      toast.error(this.translateService.instant('document.toast.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async saveAsCopy(): Promise<void> {
    const document = this.document();
    if (!document) {
      return;
    }

    try {
      const copy = await this.documentService.saveCopy({
        path: document.path,
        content: this.editedContent(),
      });
      toast.success(this.translateService.instant('document.toast.savedCopy', { path: copy.path }));
      this.editedContent.set(document.content);

      const copySlug = copy.path.split('/').pop()!.replace(/\.md$/i, '');
      await this.router.navigateByUrl(
        `${this.scope()?.routeBase ?? ''}/${this.sectionKey()}/${copySlug}`,
      );
    } catch (error) {
      toast.error(this.translateService.instant('document.toast.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadDocument(notePath: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const document = await this.documentService.read(notePath);
      if (token === this.loadToken) {
        this.fileActions.forgetDeleted(document.path);
        // The note audio channel belongs to the note shown: another note starts silent.
        this.noteAudio.stop();
        // A rename started elsewhere (section page, explorer) saves this page's edits first.
        this.unregisterOpenNote?.();
        this.unregisterOpenNote = this.fileActions.registerOpenNote(document.path, () =>
          this.saveBeforeLeave(),
        );
        this.document.set(document);
        this.editedContent.set(document.content);
        this.editorLinks.set(document.links);
        this.linkTargets.set([]);
        this.loadLinkTargets(document.path);
        this.mode.set(this.localPreferences.getDocumentViewMode(document.path));
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
