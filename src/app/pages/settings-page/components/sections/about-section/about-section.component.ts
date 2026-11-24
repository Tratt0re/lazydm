import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LocalPreferencesService } from '@/services/local-preferences.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechSwitchComponent } from '@/shared/components/switch';
import { UpdateService } from '@/shared/core/services/update.service';

/** Where the code and the releases live (the update check derives its repository from `package.json`). */
const REPOSITORY_URL = 'https://github.com/Tratt0re/lazydm';
const WEBSITE_URL = 'https://lazydm.com';
/**
 * The attribution statement the System Reference Document 5.1 asks for, word for word (CC-BY-4.0): the built-in
 * D&D 5e rules of the Quick reference are taken from it. It is not translated, and nothing else about Wizards of
 * the Coast is said (docs/design-principles.md §6h).
 */
const SRD_ATTRIBUTION =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC ' +
  'and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the ' +
  'Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-about-section',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent, ArcTechSwitchComponent],
  templateUrl: './about-section.component.html',
})
export class AboutSectionComponent {
  protected readonly updateService = inject(UpdateService);
  private readonly localPreferences = inject(LocalPreferencesService);

  protected readonly srdAttribution = SRD_ATTRIBUTION;
  protected readonly websiteUrl = WEBSITE_URL;
  protected readonly repositoryUrl = REPOSITORY_URL;
  protected readonly releasesUrl = `${REPOSITORY_URL}/releases`;
  protected readonly checkAtStartup = this.localPreferences.checkUpdatesAtStartup;
  protected readonly version = this.updateService.version;
  protected readonly checking = this.updateService.checking;
  protected readonly result = this.updateService.updateResult;
  /** Release page of the version found, or null when there is none to open. */
  protected readonly canOpenRelease = computed(
    () => this.result()?.status === 'available' && this.result()?.releaseUrl != null,
  );

  protected check(): void {
    void this.updateService.checkNow();
  }

  protected openRelease(): void {
    this.updateService.openReleasePage();
  }

  protected setCheckAtStartup(check: boolean): void {
    this.localPreferences.setCheckUpdatesAtStartup(check);
  }
}
