/** The two sides of the split screen. */
export type WorkspacePane = 'left' | 'right';

/** One campaign tab: a browser-like history of in-app URLs (`/campaigns/<slug>/...`). */
export interface WorkspaceTabDto {
  readonly id: string;
  /** Side of the split screen the tab is on; missing in tabs saved before it existed (= left). */
  readonly pane?: WorkspacePane;
  /** Last title shown for the tab's current page, so restored tabs are named before they load. */
  readonly title: string;
  readonly history: readonly string[];
  readonly historyIndex: number;
}

export interface WorkspaceDto {
  readonly tabs: readonly WorkspaceTabDto[];
  /** Active tab of the left pane. */
  readonly activeTabId: string | null;
  /** Active tab of the right pane. */
  readonly rightActiveTabId?: string | null;
  readonly updatedAtMs: number;
}

export interface SaveWorkspacePayload {
  readonly campaign: string;
  readonly tabs: readonly WorkspaceTabDto[];
  readonly activeTabId: string | null;
  readonly rightActiveTabId?: string | null;
}
