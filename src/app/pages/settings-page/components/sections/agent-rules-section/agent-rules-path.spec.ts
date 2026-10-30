import { describe, expect, it } from 'vitest';

import { toAgentRulesAbsolutePath } from './agent-rules-path';

describe('toAgentRulesAbsolutePath', () => {
  it('joins a POSIX Codex path with the vault-relative file', () => {
    expect(toAgentRulesAbsolutePath('/Users/dm/Codex', 'lost-mine/agents.md')).toBe(
      '/Users/dm/Codex/lost-mine/agents.md',
    );
  });

  it('ignores a trailing separator', () => {
    expect(toAgentRulesAbsolutePath('/Users/dm/Codex/', 'lost-mine/agents.md')).toBe(
      '/Users/dm/Codex/lost-mine/agents.md',
    );
  });

  it('keeps backslashes on a Windows Codex path', () => {
    expect(toAgentRulesAbsolutePath('C:\\Users\\dm\\Codex', 'lost-mine/agents.md')).toBe(
      'C:\\Users\\dm\\Codex\\lost-mine\\agents.md',
    );
  });
});
