/** Result of an update check (see `electron/controllers/update.controller.js`). */
export interface UpdateCheckDto {
  readonly updateAvailable: boolean;
  readonly currentVersion: string;
  readonly latestVersion: string | null;
  /** Release page of the configured repository; null when there is none to open. */
  readonly releaseUrl: string | null;
  /** The user chose to ignore this version, so no pop-up is shown for it. */
  readonly popupDismissedForThisVersion: boolean;
}
