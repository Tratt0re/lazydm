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

import { AppEncounterRowComponent } from '@/components/encounter-row/encounter-row.component';
import type { TrackerRowDensity } from '@/config/local-preferences.config';
import type { BattleRuleDto, EncounterEntityDto } from '@/dtos';
import { BattleRuleService } from '@/services/battle-rule.service';
import { CampaignService } from '@/services/campaign.service';
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechSegmentedComponent, ArcTechSegmentedItemComponent } from '@/shared/components/segmented';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechSwitchComponent } from '@/shared/components/switch';

/** Built-in layouts the page offers, in order: reference → the key of the system's name. */
const LAYOUTS: readonly { readonly ref: string; readonly system: string }[] = [
  { ref: 'builtin', system: 'generic' },
  { ref: 'builtin:dnd5e', system: 'dnd5e' },
  { ref: 'builtin:pf2e', system: 'pf2e' },
];
const DEFAULT_LAYOUT = 'builtin';
const DENSITIES: readonly TrackerRowDensity[] = ['compact', 'card', 'expanded'];

/**
 * *Tracker layouts*: the settings of the encounter tracker. Pick the built-in layout of a campaign, the size of the
 * rows and whether the turn's row opens up, and watch a mock combatant row change as you do. The layout is stored
 * with the campaign (so the MCP and every device follow it); the size and *Follow the turn* are device-local.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tracker-layouts-page',
  imports: [
    TranslatePipe,
    AppEncounterRowComponent,
    ArcTechEmptyComponent,
    ArcTechSegmentedComponent,
    ArcTechSegmentedItemComponent,
    ArcTechSwitchComponent,
    ...ArcTechSelectImports,
  ],
  templateUrl: './tracker-layouts-page.html',
  host: { class: 'flex min-h-0 flex-1 flex-col overflow-y-auto' },
})
export class TrackerLayoutsPage implements OnInit {
  private readonly battleRuleService = inject(BattleRuleService);
  private readonly campaignService = inject(CampaignService);
  private readonly localPreferences = inject(LocalPreferencesService);
  private readonly translateService = inject(TranslateService);

  protected readonly campaigns = this.campaignService.campaigns;
  protected readonly campaign = signal<string | null>(null);
  /** The layout the campaign uses (a built-in reference); the default one when it has no choice. */
  protected readonly layout = signal(DEFAULT_LAYOUT);
  private readonly rules = signal<ReadonlyMap<string, BattleRuleDto>>(new Map());

  protected readonly density = this.localPreferences.trackerRowDensity;
  protected readonly densities = DENSITIES;
  protected readonly followTurn = this.localPreferences.trackerFollowTurn;

  protected readonly layoutOptions = computed(() =>
    LAYOUTS.map((item) => ({
      value: item.ref,
      label: this.translateService.instant(`settings.templates.systems.${item.system}`),
    })),
  );
  protected readonly rule = computed(() => this.rules().get(this.layout()) ?? null);
  protected readonly previewEntities = computed(() => this.buildPreview());
  /** The combatant whose turn it is in the preview: the one the *Follow the turn* switch opens up. */
  protected readonly turnId = 'preview-goblin';

  async ngOnInit(): Promise<void> {
    try {
      const [library] = await Promise.all([
        this.battleRuleService.list(),
        this.campaignService.campaigns().length === 0 ? this.campaignService.loadCampaigns() : null,
      ]);
      this.rules.set(new Map(library.builtIns.map((item) => [item.ref, item.rule])));
    } catch (error) {
      console.warn('[app] Failed to load the tracker layouts:', error);
    }

    const first = this.campaignService.activeCampaign()?.slug ?? this.campaigns()[0]?.slug ?? null;
    if (first) {
      await this.selectCampaign(first);
    }
  }

  protected async selectCampaign(slug: string): Promise<void> {
    this.campaign.set(slug);
    try {
      const { rule, system } = await this.battleRuleService.getChoice(slug);
      // A slower answer for a campaign the user already left must not overwrite the one now shown.
      if (this.campaign() !== slug) {
        return;
      }
      // No choice of its own: the layout of the campaign's game system applies.
      this.layout.set(rule ?? (system ? `builtin:${system}` : DEFAULT_LAYOUT));
    } catch (error) {
      console.warn('[app] Failed to read the tracker layout of a campaign:', slug, error);
      this.layout.set(DEFAULT_LAYOUT);
    }
  }

  protected async selectLayout(ref: string): Promise<void> {
    const campaign = this.campaign();
    if (!campaign || ref === this.layout() || !this.rules().has(ref)) {
      return;
    }

    const previous = this.layout();
    this.layout.set(ref);
    try {
      await this.battleRuleService.setChoice(campaign, ref);
      toast.success(this.translateService.instant('battleRules.settings.saved'));
    } catch (error) {
      this.layout.set(previous);
      toast.error(this.translateService.instant('battleRules.settings.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  protected setDensity(value: string): void {
    if ((DENSITIES as readonly string[]).includes(value)) {
      this.localPreferences.setTrackerRowDensity(value as TrackerRowDensity);
    }
  }

  protected setFollowTurn(follow: boolean): void {
    this.localPreferences.setTrackerFollowTurn(follow);
  }

  /** The size of a preview row: the chosen one, or Expanded for whoever has the turn when it follows it. */
  protected densityOf(entity: EncounterEntityDto): TrackerRowDensity {
    return this.followTurn() && entity.id === this.turnId ? 'expanded' : this.density();
  }

  /** Mock combatants: one of every kind of value a layout shows (names, sides, HP with temporary HP, conditions). */
  private buildPreview(): readonly EncounterEntityDto[] {
    const text = (key: string) => this.translateService.instant(`battleRules.settings.mock.${key}`);
    return [
      {
        id: 'preview-hero',
        name: text('hero'),
        isDead: false,
        values: {
          initiative: 18,
          side: 'player',
          ac: 17,
          hp: { current: 24, max: 30 },
          fortitude: 6,
          reflex: 8,
          will: 9,
          speed: '30 ft.',
          senses: text('heroSenses'),
        },
      },
      {
        id: this.turnId,
        name: text('goblin'),
        isDead: false,
        values: {
          initiative: 14,
          side: 'enemy',
          ac: 15,
          hp: { current: 3, max: 7, temp: 2 },
          statuses: [{ name: text('stunned'), rounds: 2 }, { name: text('prone') }],
          fortitude: 3,
          reflex: 6,
          will: 1,
          speed: '30 ft.',
          senses: text('goblinSenses'),
        },
      },
      {
        id: 'preview-ogre',
        name: text('ogre'),
        isDead: false,
        values: {
          initiative: 9,
          side: 'enemy',
          ac: 11,
          hp: { current: 59, max: 59 },
          fortitude: 9,
          reflex: 1,
          will: 2,
          speed: '40 ft.',
          senses: text('ogreSenses'),
        },
      },
    ];
  }
}
