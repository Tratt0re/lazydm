export type IndexStatus = 'idle' | 'indexing' | 'ready' | 'error';

export interface IndexStatusDto {
  readonly status: IndexStatus;
  readonly vaultId: string | null;
  readonly fileCount: number;
  readonly lastIndexedAtMs: number | null;
  readonly lastError: string | null;
  /** Files looked at so far / to look at in the running full scan (0 outside of one). */
  readonly scannedCount: number;
  readonly scanTotal: number;
  /** The running update is big (or a rebuild): the app shows the blocking progress screen. */
  readonly isLargeUpdate: boolean;
}
