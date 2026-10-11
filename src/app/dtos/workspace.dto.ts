/** One campaign tab: a browser-like history of in-app URLs (`/campaigns/<slug>/...`). */
export interface WorkspaceTabDto {
  readonly id: string;
  /** Last title shown for the tab's current page, so restored tabs are named before they load. */
  readonly title: string;
  readonly history: readonly string[];
  readonly historyIndex: number;
}

export interface WorkspaceDto {
  readonly tabs: readonly WorkspaceTabDto[];
  readonly activeTabId: string | null;
  readonly updatedAtMs: number;
}

export interface SaveWorkspacePayload {
  readonly campaign: string;
  readonly tabs: readonly WorkspaceTabDto[];
  readonly activeTabId: string | null;
}
