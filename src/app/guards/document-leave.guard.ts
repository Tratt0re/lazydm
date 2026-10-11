import type { CanDeactivateFn } from '@angular/router';

import type { DocumentPage } from '@/pages/document-page/document-page';

/** Saves a note with unsaved edits before leaving it; navigation is cancelled when the save does not go through. */
export const documentLeaveGuard: CanDeactivateFn<DocumentPage> = (component) =>
  component.saveBeforeLeave();
