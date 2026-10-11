export type VaultStatus = 'none' | 'missing' | 'ready';

export interface VaultDto {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly createdAtMs: number;
  readonly lastOpenedAtMs: number;
}

export interface VaultStateDto {
  readonly status: VaultStatus;
  readonly vault: VaultDto | null;
}

export interface VaultFolderSelectionDto {
  readonly folderPath: string;
}

export interface VaultInspectionDto {
  readonly folderPath: string;
  readonly name: string;
  readonly isVault: boolean;
  readonly isEmpty: boolean;
  readonly isWritable: boolean;
}
