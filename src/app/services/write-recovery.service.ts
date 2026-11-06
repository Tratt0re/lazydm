import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import type { RecoveryAction, RecoveryEntryDto } from '@/dtos';
import { DocumentService } from '@/services/document.service';
import { ArcTechDialogService } from '@/shared/components/dialog';

/**
 * Notes whose last save may have been cut short (a crash or a power cut during an in-place write). Their unsaved text
 * is kept in the app's local data; once per session the user is asked, one note at a time, what to do with it.
 * Closing the modal without a button (Escape, click outside) leaves the rest for the next start.
 */
@Injectable({
  providedIn: 'root',
})
export class WriteRecoveryService {
  private readonly documentService = inject(DocumentService);
  private readonly dialogService = inject(ArcTechDialogService);
  private readonly translateService = inject(TranslateService);
  private hasChecked = false;

  async checkOnce(): Promise<void> {
    if (this.hasChecked) {
      return;
    }

    this.hasChecked = true;
    try {
      this.askNext([...(await this.documentService.listRecovery())]);
    } catch {
      // No vault open or the index is not ready: the next start asks again.
      this.hasChecked = false;
    }
  }

  private askNext(entries: RecoveryEntryDto[]): void {
    const entry = entries.shift();
    if (!entry) {
      return;
    }

    const t = (key: string, params?: object) => this.translateService.instant(key, params);
    const canRestore = entry.state !== 'changed';
    const run = (action: RecoveryAction) => {
      this.documentService
        .resolveRecovery({ id: entry.id, action })
        .then(() => toast.success(t(`document.recovery.done.${action}`, { path: entry.path })))
        .catch((error: unknown) =>
          toast.error(t('document.recovery.error'), {
            description: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(() => this.askNext(entries));
    };

    const dialogRef = this.dialogService.create({
      arcTitle: t('document.recovery.title'),
      arcCustomClasses: 'sm:max-w-[600px]',
      // The × fires the same event as the Discard button: only that button may delete the kept text.
      arcClosable: false,
      arcContent: t(`document.recovery.description.${entry.state}`, { path: entry.path }),
      arcOkText: canRestore ? t('document.recovery.restore') : t('document.recovery.saveCopy'),
      arcMiddleText: canRestore ? t('document.recovery.saveCopy') : undefined,
      arcCancelText: t('document.recovery.discard'),
      arcOnOk: () => {
        run(canRestore ? 'restore' : 'copy');
        dialogRef.close();
        return false;
      },
      arcOnMiddle: () => {
        run('copy');
        dialogRef.close();
        return false;
      },
      arcOnCancel: () => run('discard'),
    });
  }
}
