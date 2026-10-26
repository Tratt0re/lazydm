import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';

import { ToolbarContextService } from '@/services/toolbar-context.service';
import {
  AppSecondarySidebarComponent,
  type SecondarySidebarItem,
} from '@/components/secondary-sidebar/secondary-sidebar.component';
import { SettingsSectionHeaderComponent } from './components/settings-section-header/settings-section-header.component';
import { EditorSectionComponent } from './components/sections/editor-section/editor-section.component';
import { GeneralSectionComponent } from './components/sections/general-section/general-section.component';
import { McpSectionComponent } from './components/sections/mcp-section/mcp-section.component';
import { SectionsSectionComponent } from './components/sections/sections-section/sections-section.component';
import { VaultSectionComponent } from './components/sections/vault-section/vault-section.component';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_NAV_ITEMS,
  type SettingsSectionKey,
  isSettingsSectionKey,
} from './models/settings-nav.models';

@Component({
  selector: 'app-settings-page',
  imports: [
    TranslatePipe,
    AppSecondarySidebarComponent,
    SettingsSectionHeaderComponent,
    GeneralSectionComponent,
    EditorSectionComponent,
    SectionsSectionComponent,
    McpSectionComponent,
    VaultSectionComponent,
  ],
  template: `
    <section
      class="grid min-h-0 flex-1 content-start gap-4 p-6 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:content-normal lg:items-stretch"
    >
      <div class="lg:min-h-0 lg:overflow-hidden">
        <app-secondary-sidebar
          [items]="sidebarItems"
          [activeKey]="activeKey()"
          [ariaLabel]="'settings.sidebarAriaLabel' | translate"
          barTitle="nav.items.settings"
          (itemSelected)="onSectionSelected($any($event.key))"
        />
      </div>

      <div class="flex min-w-0 min-h-0 flex-col gap-4 lg:overflow-y-auto">
        <app-settings-section-header
          [titleKey]="activeItem().label"
          [descriptionKey]="activeItem().description"
        />

        @switch (activeKey()) {
          @case ('general') {
            <app-general-section />
          }
          @case ('editor') {
            <app-editor-section />
          }
          @case ('sections') {
            <app-sections-section />
          }
          @case ('mcp') {
            <app-mcp-section />
          }
          @case ('vault') {
            <app-vault-section />
          }
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class SettingsPage implements OnInit, OnDestroy {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toolbarContextService = inject(ToolbarContextService);

  private releaseToolbarActions: (() => void) | null = null;
  private readonly routeSection = toSignal(
    this.activatedRoute.paramMap.pipe(map((params) => params.get('section'))),
    { initialValue: DEFAULT_SETTINGS_SECTION },
  );

  protected readonly navItems = SETTINGS_NAV_ITEMS;
  protected readonly sidebarItems: readonly SecondarySidebarItem[] = SETTINGS_NAV_ITEMS.map(
    (item) => ({ key: item.key, label: item.label, description: item.description }),
  );
  protected readonly activeKey = computed<SettingsSectionKey>(() => {
    const section = this.routeSection();
    return isSettingsSectionKey(section) ? section : DEFAULT_SETTINGS_SECTION;
  });
  protected readonly activeItem = computed(
    () => this.navItems.find((item) => item.key === this.activeKey()) ?? this.navItems[0],
  );

  constructor() {
    effect(() => {
      const section = this.routeSection();

      if (section !== null && !isSettingsSectionKey(section)) {
        void this.router.navigate(['/settings', DEFAULT_SETTINGS_SECTION], { replaceUrl: true });
      }
    });
  }

  ngOnInit(): void {
    this.releaseToolbarActions = this.toolbarContextService.activate({
      title: 'nav.items.settings',
    });
  }

  ngOnDestroy(): void {
    this.releaseToolbarActions?.();
    this.releaseToolbarActions = null;
  }

  protected onSectionSelected(key: SettingsSectionKey): void {
    if (key === this.activeKey()) {
      return;
    }

    void this.router.navigate(['/settings', key]);
  }
}
