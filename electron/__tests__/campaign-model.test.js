import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const campaignModel = require('../models/campaign.model');

let vault;
beforeEach(async () => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-camp-'));
  fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
  await campaignModel.createCampaign(vault, {
    slug: 'lost-mine',
    name: 'Lost Mine',
    description: 'first description',
  });
});
afterEach(() => fs.rmSync(vault, { recursive: true, force: true }));

describe('updateCampaign', () => {
  it('changes the name and description but keeps the folder', async () => {
    const updated = await campaignModel.updateCampaign(vault, 'lost-mine', {
      name: 'Phandalin',
      description: 'new text',
    });
    expect(updated).toMatchObject({ slug: 'lost-mine', name: 'Phandalin', description: 'new text' });
    expect(fs.existsSync(path.join(vault, 'lost-mine', 'campaign.md'))).toBe(true);
  });

  it('updates the heading in the body too, and keeps the other frontmatter', async () => {
    await campaignModel.updateCampaign(vault, 'lost-mine', { name: 'Phandalin', description: null });
    const text = fs.readFileSync(path.join(vault, 'lost-mine', 'campaign.md'), 'utf8');
    expect(text).toContain('# Phandalin');
    expect(text).not.toContain('# Lost Mine');
    expect(text).toMatch(/created: \d{4}-\d{2}-\d{2}/);
  });

  it('removes the description when it is cleared', async () => {
    const updated = await campaignModel.updateCampaign(vault, 'lost-mine', {
      name: 'Lost Mine',
      description: null,
    });
    expect(updated.description).toBeNull();
    expect(fs.readFileSync(path.join(vault, 'lost-mine', 'campaign.md'), 'utf8')).not.toContain(
      'description:',
    );
  });
});

describe('forgetCampaignSettings', () => {
  it('drops only the deleted campaign from every per-campaign map', () => {
    const { writeVaultConfig, readVaultConfig } = require('../models/vault.model');
    writeVaultConfig(vault, {
      name: 'v',
      sections: { campaigns: { 'lost-mine': { hidden: ['a'] }, other: { hidden: ['b'] } } },
      templates: { campaigns: { 'lost-mine': { npc: 'x' }, other: { npc: 'y' } } },
      battleRules: { campaigns: { 'lost-mine': 'r1', other: 'r2' } },
    });
    campaignModel.forgetCampaignSettings(vault, 'lost-mine');
    const config = readVaultConfig(vault);
    expect(Object.keys(config.sections.campaigns)).toEqual(['other']);
    expect(Object.keys(config.templates.campaigns)).toEqual(['other']);
    expect(Object.keys(config.battleRules.campaigns)).toEqual(['other']);
    expect(config.name).toBe('v');
  });

  it('does nothing when the campaign has no settings', () => {
    const { writeVaultConfig, readVaultConfig } = require('../models/vault.model');
    writeVaultConfig(vault, { name: 'v' });
    campaignModel.forgetCampaignSettings(vault, 'lost-mine');
    expect(readVaultConfig(vault)).toEqual({ name: 'v' });
  });
});

describe('AI Agents rules', () => {
  const vaultModel = require('../models/vault.model');

  it('creates an empty agents.md once and never overwrites it', () => {
    expect(campaignModel.agentRulesExist(vault, 'lost-mine')).toBe(false);
    expect(campaignModel.createAgentRules(vault, 'lost-mine')).toBe('lost-mine/agents.md');
    expect(fs.readFileSync(path.join(vault, 'lost-mine', 'agents.md'), 'utf8')).toBe('');

    fs.writeFileSync(path.join(vault, 'lost-mine', 'agents.md'), 'Write in Italian.');
    expect(() => campaignModel.createAgentRules(vault, 'lost-mine')).toThrow(/already exists/);
    expect(fs.readFileSync(path.join(vault, 'lost-mine', 'agents.md'), 'utf8')).toBe(
      'Write in Italian.',
    );
  });

  it('is left out of the index: never listed, never reindexed', async () => {
    campaignModel.createAgentRules(vault, 'lost-mine');
    fs.mkdirSync(path.join(vault, 'lost-mine', 'scenes'));
    fs.writeFileSync(path.join(vault, 'lost-mine', 'scenes', 'agents.md'), '# A scene named agents');

    const files = (await vaultModel.listVaultFiles(vault)).map((file) => file.path);
    expect(files).toContain('lost-mine/campaign.md');
    expect(files).toContain('lost-mine/scenes/agents.md');
    expect(files).not.toContain('lost-mine/agents.md');
    expect(vaultModel.isIgnoredVaultPath('lost-mine/agents.md')).toBe(true);
    expect(vaultModel.isIgnoredVaultPath('lost-mine/scenes/agents.md')).toBe(false);
    expect(vaultModel.isIgnoredVaultPath('compendium/agents.md')).toBe(false);
  });
});
