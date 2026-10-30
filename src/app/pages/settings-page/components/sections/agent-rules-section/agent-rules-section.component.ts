import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  AppCodeEditorComponent,
  type CodeEditorMode,
} from '@/components/code-editor/code-editor.component';
import { AppSheetService } from '@/services/app-sheet.service';
import { CampaignService } from '@/services/campaign.service';
import { DocumentService } from '@/services/document.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAccordionImports } from '@/shared/components/accordion/accordion.imports';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

import { toAgentRulesAbsolutePath } from './agent-rules-path';

interface LoadedRules {
  readonly path: string;
  readonly content: string;
  readonly contentHash: string | null;
}

/**
 * Settings → AI Agents rules: the `agents.md` of the campaign under the sheet, written by the user in the note
 * editor. The app only creates it (empty) and saves it; what goes in is the user's. Agents reach it through the
 * MCP server (`get_agent_rules`); other tools have to be told to read the file.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-agent-rules-section',
  imports: [
    TranslatePipe,
    AppCodeEditorComponent,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechAccordionImports,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './agent-rules-section.component.html',
})
export class AgentRulesSectionComponent implements OnInit {
  private readonly campaignService = inject(CampaignService);
  private readonly documentService = inject(DocumentService);
  private readonly appSheetService = inject(AppSheetService);
  private readonly translateService = inject(TranslateService);
  private readonly vault = inject(VaultService).currentVault;

  protected readonly editorModes: readonly {
    value: CodeEditorMode;
    label: string;
    icon: ArcTechIcon;
  }[] = [
    { value: 'live', label: 'document.toolbar.live', icon: 'pencil-line' },
    { value: 'source', label: 'document.toolbar.source', icon: 'code' },
  ];

  /** Campaign of the page under the sheet (`/campaigns/<slug>/…`), or null on the campaign list. */
  protected readonly campaignSlug = signal<string | null>(null);
  protected readonly campaignName = computed(() => {
    const slug = this.campaignSlug();
    const campaign = this.campaignService.activeCampaign();
    return campaign?.slug === slug ? campaign.name : (slug ?? '');
  });
  protected readonly path = computed(() => (this.campaignSlug() ? `${this.campaignSlug()}/agents.md` : ''));
  /** Where the file is on this computer: what an assistant without the MCP server has to be pointed to. */
  protected readonly absolutePath = computed(() => {
    const codexPath = this.vault()?.path;
    return codexPath && this.path() ? toAgentRulesAbsolutePath(codexPath, this.path()) : '';
  });
  protected readonly isLoading = signal(true);
  /** Null until the user creates the file. */
  protected readonly rules = signal<LoadedRules | null>(null);
  protected readonly editedContent = signal('');
  protected readonly editorMode = signal<CodeEditorMode>('live');
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isDirty = computed(() => {
    const rules = this.rules();
    return rules !== null && this.editedContent() !== rules.content;
  });

  constructor() {
    // Leaving the sheet saves pending edits, like leaving a note.
    inject(DestroyRef).onDestroy(() => void this.save());
  }

  ngOnInit(): void {
    this.campaignSlug.set(this.readCampaignSlug());
    void this.load();
  }

  protected copyPath(): Promise<void> {
    return this.copy(this.absolutePath(), 'settings.agentRules.pathCopied');
  }

  /** A sentence to paste into an assistant that does not use the MCP server. */
  protected copyInstruction(): Promise<void> {
    return this.copy(
      this.translateService.instant('settings.agentRules.instruction', {
        path: this.absolutePath(),
      }),
      'settings.agentRules.instructionCopied',
    );
  }

  protected async create(): Promise<void> {
    const slug = this.campaignSlug();
    if (!slug) {
      return;
    }

    try {
      await this.campaignService.createAgentRules(slug);
      await this.load();
    } catch (error) {
      this.showError('settings.agentRules.createError', error);
    }
  }

  protected async save(): Promise<boolean> {
    const rules = this.rules();
    if (!rules || this.isSaving()) {
      return false;
    }

    if (!this.isDirty()) {
      return true;
    }

    this.isSaving.set(true);
    const content = this.editedContent();
    try {
      const result = await this.documentService.write({
        path: rules.path,
        content,
        expectedHash: rules.contentHash,
      });
      if (result.status === 'conflict') {
        toast.error(this.translateService.instant('settings.agentRules.conflict'), {
          action: {
            label: this.translateService.instant('settings.agentRules.reload'),
            onClick: () => void this.load(),
          },
        });
        return false;
      }

      this.rules.set({ ...rules, content, contentHash: result.contentHash });
      toast.success(this.translateService.instant('settings.agentRules.saved'));
      return true;
    } catch (error) {
      this.showError('settings.agentRules.saveError', error);
      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  private async load(): Promise<void> {
    const slug = this.campaignSlug();
    this.errorMessage.set(null);
    if (!slug) {
      this.isLoading.set(false);
      return;
    }

    try {
      const { path, exists } = await this.campaignService.getAgentRules(slug);
      if (exists) {
        const document = await this.documentService.read(path);
        this.editedContent.set(document.content);
        this.rules.set({ path, content: document.content, contentHash: document.contentHash });
      } else {
        this.rules.set(null);
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async copy(text: string, doneKey: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(this.translateService.instant(doneKey));
    } catch {
      toast.error(this.translateService.instant('settings.agentRules.copyError'));
    }
  }

  private showError(key: string, error: unknown): void {
    toast.error(this.translateService.instant(key), {
      description: error instanceof Error ? error.message : String(error),
    });
  }

  private readCampaignSlug(): string | null {
    const [root, slug] = this.appSheetService.underlyingPath().split('/');
    return root === 'campaigns' && slug ? slug : null;
  }
}
