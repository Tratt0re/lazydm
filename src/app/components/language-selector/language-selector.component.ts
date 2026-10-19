import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { I18nService } from '@/services/i18n.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import {
  ArcTechDropdownDirective,
  ArcTechDropdownMenuContentComponent,
  ArcTechDropdownMenuItemComponent,
} from '@/shared/components/dropdown';
import { ArcTechIconComponent } from '@/shared/components/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-language-selector',
  imports: [
    ArcTechButtonComponent,
    ArcTechDropdownDirective,
    ArcTechDropdownMenuContentComponent,
    ArcTechDropdownMenuItemComponent,
    ArcTechIconComponent,
    TranslatePipe,
  ],
  templateUrl: './language-selector.component.html',
})
export class LanguageSelectorComponent {
  private readonly i18nService = inject(I18nService);

  protected readonly languages = this.i18nService.supportedLanguages;
  protected readonly selectedLanguage = this.i18nService.language;

  protected getLanguageLabelKey(language: string): string {
    return `header.language.options.${language}`;
  }

  protected onLanguageChange(language: string): void {
    void this.i18nService.use(language);
  }
}
