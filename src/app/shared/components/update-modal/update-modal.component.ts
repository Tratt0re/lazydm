import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { UpdateService } from '@/shared/core/services/update.service';
import { ArcTechButtonComponent } from '@/shared/components/button/button.component';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox/checkbox.component';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';

@Component({
  selector: 'app-update-modal',
  imports: [
    A11yModule,
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechCheckboxComponent,
    ArcTechIconComponent,
  ],
  template: `
    <div
      class="cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing fixed inset-0 z-50 flex items-center justify-center p-4"
      (click)="onDismiss()"
    >
      <div
        class="relative flex w-full flex-col gap-4 overflow-hidden rounded-none border-2 border-border-strong bg-card p-6 text-card-foreground shadow-modal sm:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        aria-describedby="update-modal-description"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (click)="$event.stopPropagation()"
        (keydown.escape)="onDismiss()"
      >
        <button
          type="button"
          arc-button
          arcType="ghost"
          arcSize="sm"
          class="absolute top-4 right-4 z-10 border border-input"
          [attr.aria-label]="'common.close' | translate"
          (click)="onDismiss()"
        >
          <arc-icon arcType="x" />
        </button>

        <header class="flex flex-col gap-2">
          <h2
            id="update-modal-title"
            class="pr-12 text-left font-display text-[35px] leading-none font-extrabold tracking-[0.025em] text-foreground-strong uppercase"
          >
            {{ 'update.modal.title' | translate
            }}<span class="text-primary" aria-hidden="true">.</span>
          </h2>
          <div class="arc-engraved-divider mt-2" aria-hidden="true"><span></span></div>
          <p id="update-modal-description" class="text-sm text-muted-foreground">
            {{
              'update.modal.body'
                | translate
                  : {
                      current: updateService.updateResult()?.currentVersion,
                      latest: updateService.updateResult()?.latestVersion,
                    }
            }}
          </p>
        </header>

        <arc-checkbox [(arcChecked)]="ignoreChecked">
          {{
            'update.modal.ignore'
              | translate: { latest: updateService.updateResult()?.latestVersion }
          }}
        </arc-checkbox>

        <footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" arc-button arcType="outline" (click)="onDismiss()">
            {{ 'update.modal.cta.dismiss' | translate }}
          </button>
          <button type="button" arc-button arcType="default" (click)="onUpdate()">
            {{ 'update.modal.cta.update' | translate }}
          </button>
        </footer>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class UpdateModalComponent {
  protected readonly updateService = inject(UpdateService);
  protected readonly ignoreChecked = signal(false);

  protected onUpdate(): void {
    this.persistIgnoreIfChecked();
    this.updateService.openReleasePage();
    this.updateService.dismissModal();
  }

  protected onDismiss(): void {
    this.persistIgnoreIfChecked();
    this.updateService.dismissModal();
  }

  private persistIgnoreIfChecked(): void {
    if (this.ignoreChecked()) {
      const version = this.updateService.updateResult()?.latestVersion;
      if (version) this.updateService.ignoreVersion(version);
    }
  }
}
