import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';

import { TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { AppMenuService } from '@/services/app-menu.service';
import { Header } from '@/layout/header/header';
import { ArcTechToastComponent } from '@/shared/components/toast';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, Header, ArcTechToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly translateService = inject(TranslateService);
  /** Starts the macOS application menu (it does nothing elsewhere). */
  private readonly appMenu = inject(AppMenuService);

  private readonly lang = toSignal(
    this.translateService.onLangChange.pipe(
      map((e) => e.lang),
      startWith(this.translateService.getCurrentLang() ?? 'en'),
    ),
  );

  constructor() {
    effect(() => {
      document.documentElement.lang = this.lang() ?? 'en';
    });
  }
}

// Made with Bob
