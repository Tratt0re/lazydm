export type CloudProvider = 'icloud' | 'box' | 'dropbox' | 'onedrive' | 'google-drive';

export type CloudReadinessStatus =
  'idle' | 'checking' | 'downloading' | 'ready' | 'timeout' | 'skipped' | 'error';

export interface CloudReadinessStatusDto {
  readonly status: CloudReadinessStatus;
  readonly vaultId: string | null;
  readonly provider: CloudProvider | null;
  readonly totalFiles: number;
  readonly pendingFiles: number;
  readonly pendingPaths: readonly string[];
  readonly conflictPaths: readonly string[];
  readonly lastCheckedAtMs: number | null;
  readonly lastError: string | null;
}
