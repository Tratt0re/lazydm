import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { campaignModel, sectionModel, vaultIndexModel } = require('../models');
const indexerController = require('../controllers/indexer.controller');
const vaultController = require('../controllers/vault.controller');
const sectionController = require('../controllers/section.controller');

const file = (path) => ({ path });

/** The controller with a vault whose index holds `files`, listed by `campaign/<folder>`. */
function listWith(files) {
  vi.spyOn(vaultController, 'getReadyVaultPath').mockReturnValue('/vault');
  vi.spyOn(indexerController, 'isOpen').mockReturnValue(true);
  vi.spyOn(campaignModel, 'readCampaign').mockResolvedValue({ slug: 'camp' });
  vi.spyOn(sectionModel, 'listCampaignSections').mockReturnValue([
    { key: 'encounters' },
    { key: 'enemies' },
  ]);
  vi.spyOn(vaultIndexModel, 'listFolderFiles').mockImplementation((folder) =>
    files.filter((item) => item.path.startsWith(`${folder}/`)),
  );
  return sectionController.list({ campaign: 'camp' });
}

afterEach(() => vi.restoreAllMocks());

describe('section file counts', () => {
  it('does not count the party roster of the Encounters folder', async () => {
    const { rows } = await listWith([
      file('camp/encounters/ambush.json'),
      file('camp/encounters/_party.json'),
      file('camp/enemies/goblin.md'),
    ]);

    expect(rows.find((row) => row.key === 'encounters').fileCount).toBe(1);
    expect(rows.find((row) => row.key === 'enemies').fileCount).toBe(1);
  });

  it('counts an Encounters folder that holds only the roster as empty', async () => {
    const { rows } = await listWith([file('camp/encounters/_party.json')]);

    expect(rows.find((row) => row.key === 'encounters').fileCount).toBe(0);
  });

  it('keeps counting a file with the roster name in any other section', async () => {
    const { rows } = await listWith([file('camp/enemies/_party.json')]);

    expect(rows.find((row) => row.key === 'enemies').fileCount).toBe(1);
  });
});
