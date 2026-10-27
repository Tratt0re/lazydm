export interface McpStatusDto {
  /** The feature is switched on (off by default): its settings and the header indicator are shown. */
  readonly enabled: boolean;
  readonly running: boolean;
  readonly autostart: boolean;
  readonly allowWrite: boolean;
  /** Agents may send notes and folders to the system Trash; only while `allowWrite` is on. */
  readonly allowDelete: boolean;
  /** Agents only reach `scopeRoots`; off = the whole Codex. */
  readonly limitScope: boolean;
  /** Campaign slugs (`lost-mine`) and compendium systems (`compendium/dnd-5e`) agents may reach. */
  readonly scopeRoots: readonly string[];
  readonly port: number;
  readonly url: string;
  /** Bearer token clients must send; null while the feature is off. */
  readonly token: string | null;
  readonly lastError: string | null;
}
