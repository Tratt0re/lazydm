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
  ENCOUNTERS = 'encounters',
  WINDOW = 'window',
}

export interface ElectronIpcClient {
  readonly appMeta: {
    readonly get: IpcRequest<{ key: string }, { value: string | null }>;
    readonly set: IpcRequest<{ key: string; value: string }, { success: boolean }>;
  };
  readonly campaigns: {
    readonly list: OptionalIpcRequest<void, { rows: any[] }>;
  };
  readonly characters: {
    readonly list: OptionalIpcRequest<void, { rows: any[] }>;
  };
  readonly encounters: {
    readonly list: OptionalIpcRequest<void, { rows: any[] }>;
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
