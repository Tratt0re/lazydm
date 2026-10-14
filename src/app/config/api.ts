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
  COMPENDIUM = 'compendium',
  DOCUMENTS = 'documents',
  ENCOUNTERS = 'encounters',
  SECTIONS = 'sections',
  TEMPLATES = 'templates',
  VAULT = 'vault',
  WINDOW = 'window',
  WORKSPACE = 'workspace',
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
  readonly compendium: {
    readonly list: OptionalIpcRequest<void, { rows: DTO.CompendiumSystemDto[] }>;
    readonly get: IpcRequest<{ slug: string }, DTO.CompendiumSystemDto>;
    readonly create: IpcRequest<DTO.CreateCompendiumSystemPayload, DTO.CompendiumSystemDto>;
    readonly countFiles: IpcRequest<{ slug: string }, { count: number }>;
    readonly remove: IpcRequest<{ slug: string }, { slug: string }>;
  };
  readonly documents: {
    readonly list: IpcRequest<DTO.ListDocumentsPayload, { rows: DTO.DocumentFileListItemDto[] }>;
    readonly read: IpcRequest<DTO.ReadDocumentPayload, DTO.DocumentDto>;
    readonly write: IpcRequest<DTO.WriteDocumentPayload, DTO.WriteDocumentResultDto>;
    readonly saveCopy: IpcRequest<DTO.SaveDocumentCopyPayload, DTO.DocumentDto>;
    readonly create: IpcRequest<DTO.CreateDocumentPayload, DTO.DocumentDto>;
    readonly rename: IpcRequest<DTO.RenameDocumentPayload, DTO.RenameDocumentResultDto>;
    readonly links: IpcRequest<DTO.ReadDocumentPayload, DTO.DocumentLinksDto>;
    readonly linkTargets: IpcRequest<{ sourcePath: string }, { rows: DTO.LinkTargetDto[] }>;
    readonly brokenLinks: IpcRequest<{ campaign: string }, { rows: DTO.BrokenLinkDto[] }>;
    readonly unlink: IpcRequest<DTO.UnlinkPayload, { path: string; linkCount: number }>;
    readonly createFromLink: IpcRequest<DTO.CreateFromLinkPayload, DTO.DocumentDto>;
    readonly copy: IpcRequest<DTO.CopyDocumentPayload, DTO.CopyDocumentResultDto>;
    readonly copyPlan: IpcRequest<{ path: string; target: string }, DTO.CopyPlanDto>;
  };
  readonly encounters: {
    readonly list: OptionalIpcRequest<void, { rows: any[] }>;
  };
  readonly sections: {
    readonly list: IpcRequest<{ campaign: string }, { rows: DTO.SectionDto[] }>;
    readonly defaults: OptionalIpcRequest<void, DTO.SectionDefaultsDto>;
    readonly save: IpcRequest<
      { campaign: string; settings: DTO.SectionSettingsPayload },
      { rows: DTO.SectionDto[] }
    >;
  };
  readonly templates: {
    readonly list: OptionalIpcRequest<void, DTO.TemplateListDto>;
    readonly builtIn: IpcRequest<{ type: string }, { type: string; content: string }>;
    readonly getRules: IpcRequest<{ campaign: string }, { rules: DTO.TemplateRulesDto }>;
    readonly setRule: IpcRequest<DTO.SetTemplateRulePayload, { rules: DTO.TemplateRulesDto }>;
    readonly create: IpcRequest<DTO.CreateTemplatePayload, { path: string }>;
    readonly customize: IpcRequest<{ type: string }, { path: string }>;
    readonly remove: IpcRequest<{ path: string }, { path: string }>;
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
    readonly getState: OptionalIpcRequest<
      void,
      { platform: string; isMaximized: boolean; isFullscreen: boolean }
    >;
    readonly minimize: OptionalIpcRequest<void, void>;
    readonly toggleMaximize: OptionalIpcRequest<void, { isMaximized: boolean }>;
    readonly close: OptionalIpcRequest<void, void>;
  };
  readonly workspace: {
    readonly get: IpcRequest<{ campaign: string }, DTO.WorkspaceDto | null>;
    readonly save: IpcRequest<DTO.SaveWorkspacePayload, DTO.WorkspaceDto | null>;
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
