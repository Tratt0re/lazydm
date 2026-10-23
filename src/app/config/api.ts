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
  ASSETS = 'assets',
  BATTLE_RULES = 'battleRules',
  CAMPAIGNS = 'campaigns',
  CLOUD = 'cloud',
  COMPENDIUM = 'compendium',
  DOCUMENTS = 'documents',
  ENCOUNTERS = 'encounters',
  INDEX = 'index',
  MAPS = 'maps',
  REVIEW = 'review',
  SECTIONS = 'sections',
  TEMPLATES = 'templates',
  RESET = 'reset',
  SEARCH = 'search',
  UPDATE = 'update',
  VAULT = 'vault',
  WINDOW = 'window',
  WORKSPACE = 'workspace',
}

export interface ElectronIpcClient {
  readonly appMeta: {
    readonly get: IpcRequest<{ key: string }, { value: string | null }>;
    readonly upsert: IpcRequest<{ key: string; value: string }, unknown>;
  };
  readonly assets: {
    readonly save: IpcRequest<DTO.SaveAssetPayload, DTO.SavedAssetDto>;
    readonly import: IpcRequest<
      DTO.AssetTarget & { readonly imageOnly?: boolean },
      { files: DTO.SavedAssetDto[] }
    >;
  };
  readonly battleRules: {
    readonly list: OptionalIpcRequest<void, DTO.BattleRuleListDto>;
    readonly read: IpcRequest<{ path: string }, DTO.BattleRuleFileDto>;
    readonly write: IpcRequest<
      { path: string; rule: DTO.BattleRuleDto; expectedHash: string | null },
      DTO.WriteBattleRuleResultDto
    >;
    readonly create: IpcRequest<{ name: string }, { path: string }>;
    readonly remove: IpcRequest<{ path: string }, { path: string }>;
    readonly getChoice: IpcRequest<{ campaign: string }, { rule: string | null }>;
    readonly setChoice: IpcRequest<
      { campaign: string; rule: string | null },
      { rule: string | null }
    >;
    readonly attributes: IpcRequest<{ template: string }, { keys: readonly string[] }>;
  };
  readonly campaigns: {
    readonly list: OptionalIpcRequest<void, { rows: DTO.CampaignDto[] }>;
    readonly get: IpcRequest<{ slug: string }, DTO.CampaignDto>;
    readonly create: IpcRequest<DTO.CreateCampaignPayload, DTO.CampaignDto>;
    readonly update: IpcRequest<DTO.UpdateCampaignPayload, DTO.CampaignDto>;
    readonly countFiles: IpcRequest<{ slug: string }, { count: number }>;
    readonly remove: IpcRequest<{ slug: string }, { slug: string; deleted: number }>;
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
    readonly list: IpcRequest<DTO.ListDocumentsPayload, DTO.ListDocumentsResultDto>;
    readonly read: IpcRequest<DTO.ReadDocumentPayload, DTO.DocumentDto>;
    readonly write: IpcRequest<DTO.WriteDocumentPayload, DTO.WriteDocumentResultDto>;
    readonly saveCopy: IpcRequest<DTO.SaveDocumentCopyPayload, DTO.DocumentDto>;
    readonly create: IpcRequest<DTO.CreateDocumentPayload, DTO.DocumentDto>;
    readonly rename: IpcRequest<DTO.RenameDocumentPayload, DTO.RenameDocumentResultDto>;
    readonly renameAsset: IpcRequest<DTO.RenameAssetPayload, DTO.RenameDocumentResultDto>;
    readonly delete: IpcRequest<DTO.DeleteFilePayload, DTO.RenameDocumentResultDto>;
    readonly renameFolder: IpcRequest<{ folder: string; name: string }, DTO.RenameFolderResultDto>;
    readonly deleteFolder: IpcRequest<
      { folder: string; mode: DTO.DeleteFolderMode; rewriteLinks: boolean },
      DTO.DeleteFolderResultDto
    >;
    readonly deleteSection: IpcRequest<
      { campaign: string; section: string; rewriteLinks: boolean },
      DTO.DeleteSectionResultDto
    >;
    readonly deleteStrayFolder: IpcRequest<
      { folder: string; rewriteLinks: boolean },
      DTO.DeleteSectionResultDto
    >;
    readonly links: IpcRequest<DTO.ReadDocumentPayload, DTO.DocumentLinksDto>;
    readonly linkTargets: IpcRequest<{ sourcePath: string }, { rows: DTO.LinkTargetDto[] }>;
    readonly brokenLinks: IpcRequest<{ campaign: string }, { rows: DTO.BrokenLinkDto[] }>;
    readonly unlink: IpcRequest<DTO.UnlinkPayload, { path: string; linkCount: number }>;
    readonly createFromLink: IpcRequest<DTO.CreateFromLinkPayload, DTO.DocumentDto>;
    readonly createFolder: IpcRequest<
      { folder: string; name: string },
      { path: string; name: string }
    >;
    readonly setType: IpcRequest<
      { path: string; type: string; subtype: string | null },
      { path: string }
    >;
    readonly move: IpcRequest<{ path: string; folder: string }, DTO.MoveDocumentResultDto>;
    readonly reveal: IpcRequest<{ path: string }, { path: string }>;
    readonly open: IpcRequest<{ path: string }, { path: string }>;
    readonly copy: IpcRequest<DTO.CopyDocumentPayload, DTO.CopyDocumentResultDto>;
    readonly copyPlan: IpcRequest<{ path: string; target: string }, DTO.CopyPlanDto>;
  };
  readonly encounters: {
    readonly read: IpcRequest<{ path: string }, DTO.EncounterFileDto>;
    readonly rule: IpcRequest<{ path: string; rule?: string | null }, DTO.BattleRuleDto>;
    readonly party: IpcRequest<{ scope: string; name: string }, DTO.EncounterFileDto>;
    readonly write: IpcRequest<DTO.WriteEncounterPayload, DTO.WriteEncounterResultDto>;
    readonly create: IpcRequest<DTO.CreateEncounterPayload, DTO.EncounterFileDto>;
  };
  readonly maps: {
    readonly read: IpcRequest<{ path: string }, DTO.MapFileDto>;
    readonly write: IpcRequest<DTO.WriteMapPayload, DTO.WriteMapResultDto>;
    readonly create: IpcRequest<DTO.CreateMapPayload, DTO.MapFileDto>;
  };
  readonly review: {
    readonly list: IpcRequest<{ scope: string }, DTO.ReviewDto>;
  };
  readonly search: {
    readonly query: IpcRequest<{ campaign: string; term: string }, { rows: DTO.SearchResultDto[] }>;
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
  readonly index: {
    readonly getStatus: OptionalIpcRequest<void, unknown>;
    readonly rebuild: OptionalIpcRequest<void, unknown>;
  };
  readonly reset: {
    readonly factoryReset: OptionalIpcRequest<void, { ok: boolean; error?: string }>;
  };
  readonly update: {
    readonly check: OptionalIpcRequest<void, DTO.UpdateCheckDto>;
    readonly forceCheck: OptionalIpcRequest<void, DTO.UpdateCheckDto>;
    readonly openRelease: OptionalIpcRequest<void, void>;
    readonly ignoreVersion: IpcRequest<{ version: string }, void>;
  };
  readonly window: {
    readonly reload: OptionalIpcRequest<void, void>;
    readonly getState: OptionalIpcRequest<
      void,
      { platform: string; isMaximized: boolean; isFullscreen: boolean }
    >;
    readonly minimize: OptionalIpcRequest<void, void>;
    readonly toggleMaximize: OptionalIpcRequest<void, { isMaximized: boolean }>;
    readonly paste: OptionalIpcRequest<void, void>;
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
