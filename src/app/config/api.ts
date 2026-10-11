import type * as DTO from '@/dtos';

type IpcRequest<TPayload, TResult> = (payload: TPayload) => Promise<TResult>;
type OptionalIpcRequest<TPayload, TResult> = (payload?: TPayload) => Promise<TResult>;
type IpcEventListener<TPayload = unknown> = (payload: TPayload) => void;

export interface ElectronAppInfo {
  readonly name: string | null;
  readonly version: string | null;
  readonly author: string | null;
  readonly repositoryUrl: string | null;
}

export enum APIChannel {
  APP_META = 'appMeta',
  CAMPAIGNS = 'campaigns',
  CHARACTERS = 'characters',
  CLOUD = 'cloud',
  DOCUMENTS = 'documents',
  ENCOUNTERS = 'encounters',
  VAULT = 'vault',
  WINDOW = 'window',
}

export interface ElectronIpcClient {
  readonly appMeta: {
    readonly get: IpcRequest<{ key: string }, { value: string | null }>;
    readonly set: IpcRequest<{ key: string; value: string }, { success: boolean }>;
  };
  readonly campaigns: {
    readonly list: OptionalIpcRequest<void, { rows: DTO.CampaignDto[] }>;
    readonly get: IpcRequest<{ slug: string }, DTO.CampaignDto>;
    readonly create: IpcRequest<DTO.CreateCampaignPayload, DTO.CampaignDto>;
  };
  readonly characters: {
    readonly list: OptionalIpcRequest<void, { rows: any[] }>;
  };
  readonly cloud: {
    readonly getStatus: OptionalIpcRequest<void, DTO.CloudReadinessStatusDto>;
    readonly skipWait: OptionalIpcRequest<void, DTO.CloudReadinessStatusDto>;
    readonly recheck: OptionalIpcRequest<void, DTO.CloudReadinessStatusDto>;
  };
  readonly documents: {
    readonly list: IpcRequest<DTO.ListDocumentsPayload, { rows: DTO.DocumentFileListItemDto[] }>;
    readonly read: IpcRequest<DTO.ReadDocumentPayload, DTO.DocumentDto>;
    readonly write: IpcRequest<DTO.WriteDocumentPayload, DTO.WriteDocumentResultDto>;
    readonly saveCopy: IpcRequest<DTO.SaveDocumentCopyPayload, DTO.DocumentDto>;
    readonly create: IpcRequest<DTO.CreateDocumentPayload, DTO.DocumentDto>;
  };
  readonly encounters: {
    readonly list: OptionalIpcRequest<void, { rows: any[] }>;
  };
  readonly vault: {
    readonly getCurrent: OptionalIpcRequest<void, DTO.VaultStateDto>;
    readonly selectFolder: OptionalIpcRequest<void, DTO.VaultFolderSelectionDto | null>;
    readonly inspect: IpcRequest<{ folderPath: string }, DTO.VaultInspectionDto>;
    readonly open: IpcRequest<{ folderPath: string }, DTO.VaultStateDto>;
    readonly close: OptionalIpcRequest<void, DTO.VaultStateDto>;
  };
  readonly window: {
    readonly reload: OptionalIpcRequest<void, void>;
  };
}

export interface ElectronAPI {
  readonly ipcClient: ElectronIpcClient;
  readonly onIpcEvent?: (channel: string, listener: IpcEventListener) => void;
  readonly offIpcEvent?: (channel: string, listener: IpcEventListener) => void;
  readonly appInfo: ElectronAppInfo;
  readonly platform: string;
  readonly versions: Readonly<{
    chrome: string;
    electron: string;
    node: string;
  }>;
}

declare global {
  interface Window {
    readonly electronAPI?: ElectronAPI;
  }
}

export {};

// Made with Bob
