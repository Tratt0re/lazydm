import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const model = require('../models/quick-reference.model');
const vaultModel = require('../models/vault.model');
const campaignModel = require('../models/campaign.model');
const { createScopeGuard } = require('../mcp/scope');

const { QUICK_REFERENCE_LIMITS: LIMITS, normalizeQuickReference, parseQuickReference } = model;

const sample = () => ({
  formatVersion: 1,
  system: 'dnd5e',
  categories: [
    { id: 'actions', name: 'Actions' },
    { id: 'conditions', name: 'Conditions' },
  ],
  rules: [
    {
      id: 'dodge',
      title: 'Dodge',
      short: 'Attacks against you have disadvantage.',
      full: 'First paragraph.\n\nSecond paragraph.',
      icon: 'shield',
      categories: ['actions'],
      source: 'dnd5e/dodge',
    },
    {
      id: 'prone',
      title: 'Prone',
      short: 'Crawl, or stand up.',
      full: '',
      icon: 'arrow-down',
      categories: ['actions', 'conditions'],
    },
  ],
  attribution: 'Credit line.',
});

describe('normalizeQuickReference', () => {
  it('keeps a clean sheet as it is', () => {
    const { data, warnings } = normalizeQuickReference(sample());
    expect(data).toEqual(sample());
    expect(warnings).toEqual([]);
  });

  it('is stable: normalising the output changes nothing', () => {
    const once = normalizeQuickReference({ ...sample(), junk: 1 }).data;
    expect(normalizeQuickReference(once).data).toEqual(once);
  });

  it('gives an empty Generic sheet for anything that is not an object', () => {
    for (const value of [null, undefined, 3, 'x', [], true]) {
      const { data, warnings } = normalizeQuickReference(value);
      expect(data).toMatchObject({ system: 'generic', categories: [], rules: [] });
      expect(warnings).toEqual([{ code: 'not-an-object' }]);
    }
  });

  it('drops unknown keys and prototype keys at every level', () => {
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"x":1},"extra":1,"categories":[{"id":"a","name":"A","__proto__":{"p":1},"extra":2}],' +
        '"rules":[{"title":"T","categories":["a"],"__proto__":{"q":1},"constructor":"x","prototype":1}]}',
    );
    const { data } = normalizeQuickReference(hostile);
    expect(Object.keys(data).sort()).toEqual(
      ['attribution', 'categories', 'formatVersion', 'rules', 'system'].sort(),
    );
    expect(Object.keys(data.categories[0]).sort()).toEqual(['id', 'name']);
    expect(Object.keys(data.rules[0]).sort()).toEqual(
      ['categories', 'full', 'icon', 'id', 'short', 'title'].sort(),
    );
    expect({}.polluted).toBeUndefined();
    expect({}.p).toBeUndefined();
  });

  it('turns wrong types into defaults and drops entries it cannot use', () => {
    const { data, warnings } = normalizeQuickReference({
      system: 'dnd2024',
      categories: [null, 'x', { name: '' }, { name: 3 }, { name: 'Ok' }],
      rules: [
        null,
        5,
        { title: '   ' },
        { title: 7 },
        { title: 'Real', short: 4, full: {}, icon: 9 },
      ],
    });
    expect(data.system).toBe('generic');
    expect(data.categories).toEqual([{ id: 'ok', name: 'Ok' }]);
    expect(data.rules).toEqual([
      { id: 'real', title: 'Real', short: '', full: '', icon: 'book-open', categories: [] },
    ]);
    expect(warnings.filter((w) => w.code === 'category-dropped')).toHaveLength(4);
    expect(warnings.filter((w) => w.code === 'rule-dropped')).toHaveLength(4);
  });

  it('makes ids unique and slug-shaped', () => {
    const { data } = normalizeQuickReference({
      categories: [
        { id: 'a', name: 'One' },
        { id: 'a', name: 'Two' },
        { id: 'Not A Slug!', name: 'Three' },
      ],
      rules: [
        { id: 'x', title: 'First' },
        { id: 'x', title: 'Second' },
        { title: 'First' },
        { id: '../../etc', title: 'Dots' },
      ],
    });
    expect(data.categories.map((c) => c.id)).toEqual(['a', 'a-2', 'three']);
    expect(data.rules.map((r) => r.id)).toEqual(['x', 'x-2', 'first', 'dots']);
  });

  it('drops a category id that does not exist and says so', () => {
    const { data, warnings } = normalizeQuickReference({
      categories: [{ id: 'a', name: 'A' }],
      rules: [{ title: 'T', categories: ['a', 'gone', 'a', 7, null, '__proto__'] }],
    });
    expect(data.rules[0].categories).toEqual(['a']);
    expect(warnings).toContainEqual({ code: 'category-links-dropped', count: 5 });
  });

  it('puts an icon outside the allow-list back to the default', () => {
    const { data } = normalizeQuickReference({
      rules: [
        { title: 'A', icon: 'shield' },
        { title: 'B', icon: 'not-an-icon' },
        { title: 'C', icon: '<script>' },
      ],
    });
    expect(data.rules.map((r) => r.icon)).toEqual(['shield', 'book-open', 'book-open']);
  });

  it('keeps `source` only when it is a built-in key', () => {
    const { data } = normalizeQuickReference({
      rules: [
        { title: 'A', source: 'dnd5e/dodge' },
        { title: 'B', source: '../x' },
        { title: 'C', source: 'a/b/c' },
        { title: 'D', source: 9 },
      ],
    });
    expect(data.rules.map((r) => r.source)).toEqual([
      'dnd5e/dodge',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('cuts every text to its cap and strips control characters', () => {
    const { data } = normalizeQuickReference({
      attribution: 'a'.repeat(LIMITS.attribution + 50),
      categories: [{ name: 'c'.repeat(LIMITS.categoryName + 10) }],
      rules: [
        {
          title: 't'.repeat(LIMITS.title + 10),
          short: `s\u0000\u0007${'s'.repeat(LIMITS.short + 10)}`,
          full: `f\u0000\r\n${'f'.repeat(LIMITS.full + 10)}`,
        },
      ],
    });
    expect(data.attribution).toHaveLength(LIMITS.attribution);
    expect(data.categories[0].name).toHaveLength(LIMITS.categoryName);
    expect(data.rules[0].title).toHaveLength(LIMITS.title);
    expect(data.rules[0].short).toHaveLength(LIMITS.short);
    expect(data.rules[0].short).not.toMatch(/\u0000|\u0007/);
    expect(data.rules[0].full).toHaveLength(LIMITS.full);
    expect(data.rules[0].full).not.toMatch(/\u0000|\r/);
  });

  it('keeps the line breaks of a full description and collapses them in a title', () => {
    const { data } = normalizeQuickReference({
      rules: [{ title: 'Two\nlines   here', full: 'a\r\n\r\nb\rc' }],
    });
    expect(data.rules[0].title).toBe('Two lines here');
    expect(data.rules[0].full).toBe('a\n\nb\nc');
  });

  it('cuts the number of categories and rules, and says how many', () => {
    const { data, warnings } = normalizeQuickReference({
      categories: Array.from({ length: LIMITS.categories + 3 }, (_, i) => ({ name: `C${i}` })),
      rules: Array.from({ length: LIMITS.rules + 7 }, (_, i) => ({ title: `R${i}` })),
    });
    expect(data.categories).toHaveLength(LIMITS.categories);
    expect(data.rules).toHaveLength(LIMITS.rules);
    expect(warnings).toContainEqual({ code: 'categories-cut', count: 3 });
    expect(warnings).toContainEqual({ code: 'rules-cut', count: 7 });
  });

  it('warns about a file written by a newer app but still reads what it knows', () => {
    const { data, warnings } = normalizeQuickReference({ ...sample(), formatVersion: 9 });
    expect(warnings).toContainEqual({ code: 'newer-format' });
    expect(data.formatVersion).toBe(1);
    expect(data.rules).toHaveLength(2);
  });
});

describe('parseQuickReference', () => {
  it('reads JSON text', () => {
    expect(parseQuickReference(JSON.stringify(sample())).data).toEqual(sample());
  });

  it('answers an empty sheet and a warning for text that is not JSON, never throws', () => {
    for (const text of ['', '{', 'not json', '[1,2', undefined, null, 42]) {
      const result = parseQuickReference(text);
      expect(result.data.rules).toEqual([]);
      expect(result.warnings).toEqual([{ code: 'parse-error' }]);
    }
  });

  it('refuses a text over the size cap without parsing it', () => {
    const text = JSON.stringify({ rules: [{ title: 'x', full: 'y'.repeat(LIMITS.fileBytes) }] });
    expect(parseQuickReference(text)).toMatchObject({
      data: { rules: [] },
      warnings: [{ code: 'too-large' }],
    });
  });

  it('survives deep nesting and a huge array of junk', () => {
    const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
    expect(parseQuickReference(deep).data.rules).toEqual([]);
    const junk = JSON.stringify({ rules: Array.from({ length: 50000 }, () => null) });
    expect(parseQuickReference(junk).data.rules).toEqual([]);
  });
});

describe('the file on disk', () => {
  let root;
  let vault;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-quickref-'));
    vault = path.join(root, 'codex');
    fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
    fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
    await campaignModel.createCampaign(vault, {
      slug: 'lost-mine',
      name: 'Lost Mine',
      system: 'dnd5e',
    });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const file = () => path.join(vault, 'lost-mine', 'quick-reference.json');

  it('answers an empty sheet and creates nothing for a campaign with no file', async () => {
    const result = await model.readQuickReference(vault, 'lost-mine');
    expect(result).toMatchObject({
      path: 'lost-mine/quick-reference.json',
      exists: false,
      contentHash: null,
      mtimeMs: null,
      data: { rules: [], categories: [] },
    });
    expect(fs.existsSync(file())).toBe(false);
  });

  it('creates the file on the first save, then round-trips it', async () => {
    const saved = await model.writeQuickReference(vault, 'lost-mine', sample(), null);
    expect(saved.status).toBe('saved');
    expect(saved.data).toEqual(sample());
    expect(fs.readFileSync(file(), 'utf8').endsWith('\n')).toBe(true);

    const read = await model.readQuickReference(vault, 'lost-mine');
    expect(read.exists).toBe(true);
    expect(read.data).toEqual(sample());
    expect(read.contentHash).toBe(saved.contentHash);
    expect(read.warnings).toEqual([]);
  });

  it('writes only the clean version of what it is given', async () => {
    const dirty = { ...sample(), extra: 'x', rules: [{ title: 'Only', icon: 'nope', junk: 1 }] };
    await model.writeQuickReference(vault, 'lost-mine', dirty, null);
    const onDisk = JSON.parse(fs.readFileSync(file(), 'utf8'));
    expect(onDisk.extra).toBeUndefined();
    expect(onDisk.rules).toEqual([
      { id: 'only', title: 'Only', short: '', full: '', icon: 'book-open', categories: [] },
    ]);
  });

  it('answers a conflict, and writes nothing, when the file changed since it was read', async () => {
    const first = await model.writeQuickReference(vault, 'lost-mine', sample(), null);
    fs.writeFileSync(file(), JSON.stringify({ ...sample(), attribution: 'from another computer' }));

    const mine = { ...sample(), attribution: 'mine' };
    const result = await model.writeQuickReference(vault, 'lost-mine', mine, first.contentHash);
    expect(result.status).toBe('conflict');
    expect(result.current.data.attribution).toBe('from another computer');
    expect(JSON.parse(fs.readFileSync(file(), 'utf8')).attribution).toBe('from another computer');
  });

  it('answers a conflict for a first save when the file appeared meanwhile', async () => {
    fs.writeFileSync(file(), JSON.stringify(sample()));
    const result = await model.writeQuickReference(vault, 'lost-mine', sample(), null);
    expect(result.status).toBe('conflict');
  });

  it('opens a file that is not valid JSON as an empty sheet with a warning, and keeps it until saved', async () => {
    fs.writeFileSync(file(), '{ broken');
    const read = await model.readQuickReference(vault, 'lost-mine');
    expect(read).toMatchObject({
      exists: true,
      data: { rules: [] },
      warnings: [{ code: 'parse-error' }],
    });
    expect(fs.readFileSync(file(), 'utf8')).toBe('{ broken');
  });

  it('reads a hostile file cleanly', async () => {
    fs.writeFileSync(
      file(),
      '{"__proto__":{"x":1},"rules":[{"title":"T","categories":["nope"],"icon":"<img onerror=1>"}]}',
    );
    const read = await model.readQuickReference(vault, 'lost-mine');
    expect(read.data.rules).toEqual([
      { id: 't', title: 'T', short: '', full: '', icon: 'book-open', categories: [] },
    ]);
    expect({}.x).toBeUndefined();
  });

  it('refuses a campaign that does not exist, and a slug that is a path', async () => {
    await expect(model.readQuickReference(vault, 'nope')).rejects.toThrow(/not found/i);
    for (const slug of [
      '../codex',
      '../codex/lost-mine',
      './lost-mine',
      'lost-mine/',
      'lost-mine/..',
      '..',
      'a/b',
      '',
      '.lazydm',
      'Lost Mine',
      3,
      null,
    ]) {
      await expect(model.readQuickReference(vault, slug)).rejects.toThrow();
      await expect(model.writeQuickReference(vault, slug, sample(), null)).rejects.toThrow();
    }
    expect(fs.existsSync(path.join(root, 'quick-reference.json'))).toBe(false);
    expect(fs.existsSync(path.join(vault, 'quick-reference.json'))).toBe(false);
  });

  it('is left out of the vault file listing like agents.md, so the index never holds it', async () => {
    await model.writeQuickReference(vault, 'lost-mine', sample(), null);
    fs.writeFileSync(path.join(vault, 'lost-mine', 'agents.md'), 'x');
    fs.mkdirSync(path.join(vault, 'lost-mine', 'scenes'));
    fs.writeFileSync(path.join(vault, 'lost-mine', 'scenes', 'quick-reference.json'), '{}');
    const files = (await vaultModel.listVaultFiles(vault)).map((f) => f.path);
    expect(files).not.toContain('lost-mine/quick-reference.json');
    expect(files).not.toContain('lost-mine/agents.md');
    expect(files).toContain('lost-mine/scenes/quick-reference.json');
    expect(vaultModel.isIgnoredVaultPath('lost-mine/quick-reference.json')).toBe(true);
    expect(vaultModel.isIgnoredVaultPath('lost-mine/Quick-Reference.JSON')).toBe(true);
    expect(vaultModel.isIgnoredVaultPath('lost-mine/scenes/quick-reference.json')).toBe(false);
  });
});

describe('MCP scope', () => {
  it('never lets a note tool write the quick reference, and still lets it be read', () => {
    const guard = createScopeGuard(null);
    expect(() => guard.resolveWritable('lost-mine/quick-reference.json')).toThrow(
      /quick reference/i,
    );
    expect(() => guard.resolveWritable('lost-mine/Quick-Reference.json')).toThrow(
      /quick reference/i,
    );
    expect(guard.resolve('lost-mine/quick-reference.json')).toBe('lost-mine/quick-reference.json');
    expect(guard.resolveWritable('lost-mine/scenes/quick-reference.json')).toBe(
      'lost-mine/scenes/quick-reference.json',
    );
  });
});
