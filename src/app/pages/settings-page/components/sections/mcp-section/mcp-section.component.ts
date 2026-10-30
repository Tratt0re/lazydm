import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { CampaignService } from '@/services/campaign.service';
import { CompendiumService } from '@/services/compendium.service';
import { McpService } from '@/services/mcp.service';
import { VaultService } from '@/services/vault.service';
import { ArcTechAccordionImports } from '@/shared/components/accordion/accordion.imports';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog/alert-dialog.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox/checkbox.component';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechInputDirective } from '@/shared/components/input';
import { ArcTechSwitchComponent } from '@/shared/components/switch';

/** Settings → MCP: what it is and what it risks first; everything else only while it is switched on. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-mcp-section',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechCheckboxComponent,
    ArcTechIconComponent,
    ArcTechInputDirective,
    ArcTechSwitchComponent,
    ...ArcTechAccordionImports,
  ],
  templateUrl: './mcp-section.component.html',
})
export class McpSectionComponent implements OnInit {
  private readonly mcp = inject(McpService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);
  private readonly campaignService = inject(CampaignService);
  private readonly compendiumService = inject(CompendiumService);
  private readonly vault = inject(VaultService).currentVault;

  protected readonly state = this.mcp.state;
  /** What an agent can be limited to: each campaign, and each compendium system. */
  protected readonly scopeOptions = computed<readonly { root: string; label: string }[]>(() => [
    ...this.campaignService.campaigns().map((campaign) => ({
      root: campaign.slug,
      label: campaign.name,
    })),
    ...this.compendiumService.systems().map((system) => ({
      root: `compendium/${system.slug}`,
      label: system.name,
    })),
  ]);
  /**
   * The Codex path as a Claude Code rule path: `//` + the absolute path, with a Windows drive as `/c`
   * (its permission docs: "Use `//Users/alice/file` for absolute paths").
   */
  protected readonly claudeRulePath = computed(() => {
    const posixPath = (this.vault()?.path ?? '')
      .replace(/\\/g, '/')
      .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)
      .replace(/\/+$/, '');
    return `/${posixPath}`;
  });
  protected readonly claudeDenyRule = computed(() => `Edit(${this.claudeRulePath()}/**)`);
  protected readonly claudeSettingsSnippet = computed(
    () => `{\n  "permissions": {\n    "deny": ["${this.claudeDenyRule()}"]\n  }\n}`,
  );
  /**
   * OpenCode asks before every edit and refuses the ones inside the Codex folder; its docs say the last matching
   * rule wins, so the catch-all comes first.
   */
  protected readonly opencodePermissionSnippet = computed(() => {
    const folder = (this.vault()?.path ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
    return JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        permission: { edit: { '*': 'ask', [`${folder}/**`]: 'deny' }, bash: 'ask' },
      },
      null,
      2,
    );
  });
  protected readonly isBusy = signal(false);
  protected readonly portText = computed(() => String(this.state()?.port ?? ''));
  protected readonly isTokenShown = signal(false);
  protected readonly shownToken = computed(() => {
    const token = this.state()?.token ?? '';
    return this.isTokenShown() ? token : '•'.repeat(Math.min(token.length, 24));
  });
  protected readonly claudeCommand = computed(() => {
    const state = this.state();
    return state?.token
      ? `claude mcp add --transport http lazydm ${state.url} --header "Authorization: Bearer ${state.token}"`
      : '';
  });
  /** The lines hold the token: they are shown masked until the eye is pressed, but always copied in full. */
  protected readonly areLinesShown = signal(false);
  protected readonly claudeCommandShown = computed(() => this.maskToken(this.claudeCommand()));
  /** OpenAI Codex reads the token from an environment variable, so the token is never written into its config. */
  protected readonly codexConfig = computed(() => {
    const state = this.state();
    return state?.token
      ? `[mcp_servers.lazydm]\nurl = "${state.url}"\nbearer_token_env_var = "LAZYDM_MCP_TOKEN"`
      : '';
  });
  /** OpenCode fills `{env:NAME}` from the environment, so it shares the variable OpenAI Codex reads. */
  protected readonly opencodeConfig = computed(() => {
    const state = this.state();
    return state?.token
      ? JSON.stringify(
          {
            $schema: 'https://opencode.ai/config.json',
            mcp: {
              lazydm: {
                type: 'remote',
                url: state.url,
                enabled: true,
                headers: { Authorization: 'Bearer {env:LAZYDM_MCP_TOKEN}' },
              },
            },
          },
          null,
          2,
        )
      : '';
  });
  /** The one line both set the token with: shown masked until the eye is pressed, always copied in full. */
  protected readonly tokenEnv = computed(() => {
    const token = this.state()?.token;
    return token ? `export LAZYDM_MCP_TOKEN="${token}"` : '';
  });
  protected readonly tokenEnvShown = computed(() => this.maskToken(this.tokenEnv()));

  ngOnInit(): void {
    void this.mcp.connect();
    void this.campaignService.loadCampaigns().catch(() => undefined);
    void this.compendiumService.loadSystems().catch(() => undefined);
  }

  protected onLimitScopeChange(limitScope: boolean): void {
    void this.run(() => this.mcp.setLimitScope(limitScope));
  }

  protected isInScope(root: string): boolean {
    return this.state()?.scopeRoots.includes(root) ?? false;
  }

  protected onScopeToggle(root: string, isChecked: boolean): void {
    const current = this.state()?.scopeRoots ?? [];
    const next = isChecked ? [...current, root] : current.filter((item) => item !== root);
    void this.run(() => this.mcp.setScopeRoots(next));
  }

  /** Switching on asks first: this opens the vault to other programs. Switching off just stops it. */
  protected onEnabledChange(enabled: boolean): void {
    if (!enabled) {
      void this.run(() => this.mcp.setEnabled(false));
      return;
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('settings.mcp.enable.title'),
      arcDescription: this.translateService.instant('settings.mcp.enable.description'),
      arcOkText: this.translateService.instant('settings.mcp.enable.confirm'),
      arcCancelText: this.translateService.instant('common.cancel'),
      arcOnOk: () => void this.run(() => this.mcp.setEnabled(true)),
    });
  }

  protected toggleRunning(): void {
    void this.run(() => (this.state()?.running ? this.mcp.stop() : this.mcp.start()));
  }

  protected onAllowWriteChange(allowWrite: boolean): void {
    void this.run(() => this.mcp.setAllowWrite(allowWrite));
  }

  /** Switching on asks first: the agent can then send notes to the Trash. Switching off just stops it. */
  protected onAllowDeleteChange(allowDelete: boolean): void {
    if (!allowDelete) {
      void this.run(() => this.mcp.setAllowDelete(false));
      return;
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('settings.mcp.delete.confirmTitle'),
      arcDescription: this.translateService.instant('settings.mcp.delete.confirmDescription'),
      arcOkText: this.translateService.instant('settings.mcp.delete.confirm'),
      arcCancelText: this.translateService.instant('common.cancel'),
      arcOnOk: () => void this.run(() => this.mcp.setAllowDelete(true)),
    });
  }

  protected onAutostartChange(autostart: boolean): void {
    void this.run(() => this.mcp.setAutostart(autostart));
  }

  protected onPortChange(input: HTMLInputElement): void {
    const port = Number(input.value);
    void this.run(() => this.mcp.setPort(port)).then(() => {
      input.value = this.portText();
    });
  }

  protected confirmRegenerate(): void {
    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('settings.mcp.token.regenerateTitle'),
      arcDescription: this.translateService.instant('settings.mcp.token.regenerateDescription'),
      arcOkText: this.translateService.instant('settings.mcp.token.regenerateConfirm'),
      arcCancelText: this.translateService.instant('common.cancel'),
      arcOnOk: () => void this.run(() => this.mcp.regenerateToken()),
    });
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(this.translateService.instant('settings.mcp.copied'));
    } catch {
      toast.error(this.translateService.instant('settings.mcp.copyError'));
    }
  }

  private maskToken(line: string): string {
    const token = this.state()?.token;
    return token && !this.areLinesShown() ? line.replaceAll(token, '•'.repeat(24)) : line;
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.isBusy.set(true);
    try {
      await task();
    } catch (error) {
      console.warn('[app] MCP settings action failed:', error);
      toast.error(this.translateService.instant('settings.mcp.error'));
    } finally {
      this.isBusy.set(false);
    }
  }
}
