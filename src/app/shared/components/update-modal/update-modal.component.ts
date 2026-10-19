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
      class="fixed inset-0 z-50 flex items-center justify-center bg-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      (keydown.escape)="onDismiss()"
    >
      <div
        class="relative flex w-full max-w-md flex-col gap-5 overflow-hidden rounded-none border-2 border-border-strong bg-card p-6 text-card-foreground shadow-modal"
      >
        <header class="flex flex-col gap-3">
          <div class="flex items-center gap-2 text-primary">
            <arc-icon arcType="arrow-up" class="size-4 shrink-0" />
            <h2
              id="update-modal-title"
              class="font-display text-[35px] leading-none font-extrabold tracking-[0.025em] text-foreground-strong uppercase"
            >
              {{ 'update.modal.title' | translate }}
            </h2>
          </div>
          <p class="text-sm text-muted-foreground">
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
            {{
              'update.modal.cta.dismiss'
                | translate: { current: updateService.updateResult()?.currentVersion }
            }}
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
