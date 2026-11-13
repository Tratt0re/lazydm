import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const templateModel = require('../models/template.model');
const { parseMarkdownDocument } = require('../utils/markdown-parse');

const { BUILT_IN_SYSTEMS, DEFAULT_SYSTEM, getBuiltInTemplate, parseBuiltInRef } = templateModel;
const GAME_TYPES = ['enemy', 'character', 'spell'];

function keysOf(type, system) {
  const { frontmatter } = parseMarkdownDocument(getBuiltInTemplate(type, system), {
    sourcePath: 'template.md',
  });
  return Object.keys(frontmatter ?? {});
}

describe('built-in templates by system', () => {
  it('lists the default system first, then the games', () => {
    expect(BUILT_IN_SYSTEMS).toEqual(['generic', 'dnd5e', 'pf2e']);
  });

  it('gives the base template when no system is asked', () => {
    expect(getBuiltInTemplate('enemy')).toBe(getBuiltInTemplate('enemy', DEFAULT_SYSTEM));
    expect(keysOf('enemy')).toEqual(['title', 'cr', 'hp', 'ac', 'initiative_mod']);
  });

  it('parses every template of every system and type', () => {
    for (const system of BUILT_IN_SYSTEMS) {
      for (const type of templateModel.TEMPLATE_NOTE_TYPES) {
        const { frontmatter } = parseMarkdownDocument(getBuiltInTemplate(type, system), {
          sourcePath: 'template.md',
        });
        expect(frontmatter, `${system}/${type}`).toHaveProperty('title');
        // A note's kind is its folder, never a key (see note-type.test.js).
        expect(frontmatter, `${system}/${type}`).not.toHaveProperty('type');
      }
    }
  });

  it('keeps the keys notes written before already use', () => {
    // D&D 5e keeps every key of the default system. Pathfinder keeps the ones its game shares: its enemies have a
    // level where the default has a challenge rating, and its spells a rank, `cast`... where the default has
    // `level`, `casting_time`...
    const renamedInPathfinder = {
      enemy: ['cr'],
      character: [],
      spell: ['level', 'school', 'casting_time'],
    };
    for (const type of GAME_TYPES) {
      const base = keysOf(type, DEFAULT_SYSTEM);
      expect(keysOf(type, 'dnd5e'), `dnd5e/${type}`).toEqual(expect.arrayContaining(base));
      expect(keysOf(type, 'pf2e'), `pf2e/${type}`).toEqual(
        expect.arrayContaining(base.filter((key) => !renamedInPathfinder[type].includes(key))),
      );
    }
  });

  it('makes D&D 5e enemies, NPCs and spells playable', () => {
    expect(keysOf('enemy', 'dnd5e')).toEqual(
      expect.arrayContaining([
        'ac',
        'hp',
        'hit_dice',
        'speed',
        'initiative_mod',
        'str',
        'dex',
        'cha',
      ]),
    );
    expect(keysOf('character', 'dnd5e')).toEqual(
      expect.arrayContaining(['ac', 'hp', 'initiative_mod', 'con', 'wis']),
    );
    expect(keysOf('spell', 'dnd5e')).toEqual(
      expect.arrayContaining(['level', 'school', 'components', 'concentration', 'ritual']),
    );
  });

  it('makes Pathfinder 2e enemies, NPCs and spells playable', () => {
    expect(keysOf('enemy', 'pf2e')).toEqual(
      expect.arrayContaining(['level', 'ac', 'hp', 'perception', 'fortitude', 'reflex', 'will']),
    );
    expect(keysOf('character', 'pf2e')).toEqual(
      expect.arrayContaining(['ac', 'hp', 'perception', 'ancestry']),
    );
    expect(keysOf('spell', 'pf2e')).toEqual(
      expect.arrayContaining(['rank', 'traditions', 'cast', 'defense']),
    );
  });

  it('uses the base template for a type a system has no variant of', () => {
    expect(getBuiltInTemplate('quest', 'dnd5e')).toBe(getBuiltInTemplate('quest'));
    expect(getBuiltInTemplate('item', 'pf2e')).toBe(getBuiltInTemplate('item'));
  });

  it('falls back to the base template for an unknown system', () => {
    expect(getBuiltInTemplate('enemy', 'nope')).toBe(getBuiltInTemplate('enemy'));
  });

  it('lists the systems that vary a type', () => {
    expect(templateModel.listSystemsOfType('enemy')).toEqual(['dnd5e', 'pf2e']);
    expect(templateModel.listSystemsOfType('quest')).toEqual([]);
  });

  it('only accepts the systems it ships', () => {
    expect(templateModel.isBuiltInSystem('dnd5e')).toBe(true);
    expect(templateModel.isBuiltInSystem('generic')).toBe(true);
    expect(templateModel.isBuiltInSystem('../etc')).toBe(false);
  });
});

describe('built-in template references', () => {
  it('reads `builtin:<type>` as the default system', () => {
    expect(parseBuiltInRef('builtin:enemy')).toEqual({ type: 'enemy', system: 'generic' });
  });

  it('reads `builtin:<type>@<system>`', () => {
    expect(parseBuiltInRef('builtin:enemy@dnd5e')).toEqual({ type: 'enemy', system: 'dnd5e' });
  });

  it('gives the keys a rule can read from a system reference', async () => {
    const keys = await templateModel.readTemplateKeys('/unused', 'builtin:enemy@dnd5e');
    expect(keys).toEqual(expect.arrayContaining(['ac', 'hp', 'initiative_mod', 'dex']));
    expect(keys).not.toContain('title');

    const generic = await templateModel.readTemplateKeys('/unused', 'builtin:enemy');
    expect(generic).toEqual(['cr', 'hp', 'ac', 'initiative_mod']);
  });
});
