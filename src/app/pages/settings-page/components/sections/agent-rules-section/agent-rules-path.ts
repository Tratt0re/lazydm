/**
 * Absolute path of a campaign's `agents.md` on this computer, for an assistant that does not use the MCP server.
 * It keeps the separator the Codex path already uses (`\` on Windows).
 */
export function toAgentRulesAbsolutePath(codexPath: string, relativePath: string): string {
  const separator = codexPath.includes('\\') && !codexPath.includes('/') ? '\\' : '/';
  const root = codexPath.replace(/[\\/]+$/, '');
  return `${root}${separator}${relativePath.split('/').join(separator)}`;
}
