import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings-section-header',
  imports: [TranslatePipe],
  template: `
    <header class="border-b border-border pb-4">
      <h2 class="font-display text-3xl leading-none font-extrabold tracking-[0.02em] uppercase">
        {{ titleKey() | translate }}<span class="text-primary" aria-hidden="true">.</span>
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ descriptionKey() | translate }}
      </p>
    </header>
  `,
})
export class SettingsSectionHeaderComponent {
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
}
