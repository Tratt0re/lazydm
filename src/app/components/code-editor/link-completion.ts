import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionKeymap,
  pickedCompletion,
} from '@codemirror/autocomplete';
import { type Extension, Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import type { LinkTargetDto } from '@/dtos';

/** What the link suggestions need: the files of the note's scope (vault index) and the note's path. */
export interface LinkCompletionContext {
  readonly targets: readonly LinkTargetDto[];
  readonly sourcePath: string;
}

/** Updates the files the editor suggests while a link is typed. */
export const setLinkCompletionContext = StateEffect.define<LinkCompletionContext>();

const MAX_OPTIONS = 50;
const MARKDOWN_EXTENSION = '.md';
const COMPENDIUM_DIR_NAME = 'compendium';
/** `[[` or `![[` and the target typed so far (before any `]`, `|` or `#`). */
const WIKILINK_BEFORE = /!?\[\[[^[\]|#\n]*$/;
/** `[label](` or `![alt](` and the target typed so far. */
const MARKDOWN_BEFORE = /\[[^[\]\n]*\]\([^()\s]*$/;

const contextField = StateField.define<LinkCompletionContext>({
  create: () => ({ targets: [], sourcePath: '' }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLinkCompletionContext)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * The library keymap without its macOS-only Option shortcuts (`Alt-\``, `Alt-i`): on several layouts
 * Option types a character (Italian: Option+\ is the backtick), which those shortcuts would swallow.
 * Ctrl-Space still opens the suggestions. Highest precedence, like the library's own keymap.
 */
const linkCompletionKeymap = Prec.highest(
  keymap.of([
    ...completionKeymap.filter((binding) => !binding.mac),
    // Tab picks the highlighted suggestion, like Enter (without suggestions open it does nothing here).
    { key: 'Tab', run: acceptCompletion },
  ]),
);

/**
 * Link suggestions: typing `[[`, `![[` or `[label](` opens a list of the files of the note's own scope
 * (campaign or compendium system), filtered as the target is typed. Picking one writes a link that
 * resolves: the bare name (or the path when the name is taken twice) for wikilinks, a relative path
 * for markdown links.
 */
export function linkCompletion(): Extension {
  return [
    contextField,
    autocompletion({
      override: [linkCompletions],
      icons: false,
      maxRenderedOptions: MAX_OPTIONS,
      defaultKeymap: false,
    }),
    linkCompletionKeymap,
    completionTheme,
  ];
}

function linkCompletions(context: CompletionContext): CompletionResult | null {
  const { targets, sourcePath } = context.state.field(contextField);
  if (targets.length === 0) {
    return null;
  }

  const scopePrefix = getScopePrefix(sourcePath);
  const wikilink = context.matchBefore(WIKILINK_BEFORE);
  if (wikilink) {
    const isEmbed = wikilink.text.startsWith('!');
    const from = wikilink.from + (isEmbed ? 3 : 2);
    const duplicateNames = findDuplicateNames(targets);
    return {
      from,
      filter: false,
      options: rankTargets(targets, context.state.sliceDoc(from, context.pos), isEmbed).map(
        (target) =>
          toOption(
            target,
            scopePrefix,
            getWikilinkTarget(target, scopePrefix, duplicateNames),
            ']]',
          ),
      ),
    };
  }

  const markdown = context.matchBefore(MARKDOWN_BEFORE);
  if (markdown) {
    const from = markdown.from + markdown.text.lastIndexOf('](') + 2;
    const isEmbed = context.state.sliceDoc(markdown.from - 1, markdown.from) === '!';
    const sourceDir = sourcePath.split('/').slice(0, -1);
    return {
      from,
      filter: false,
      options: rankTargets(targets, context.state.sliceDoc(from, context.pos), isEmbed).map(
        (target) => toOption(target, scopePrefix, toMarkdownHref(sourceDir, target.path), ')'),
      ),
    };
  }

  return null;
}

/** Inserts the link target, adds the closing brackets unless they are already there, and moves past them. */
function toOption(
  target: LinkTargetDto,
  scopePrefix: string,
  linkTarget: string,
  closing: string,
): Completion {
  return {
    label: target.title || target.name,
    detail: target.path.startsWith(scopePrefix)
      ? target.path.slice(scopePrefix.length)
      : target.path,
    apply: (view, completion, from, to) => {
      const hasClosing = view.state.sliceDoc(to, to + closing.length) === closing;
      const insert = hasClosing ? linkTarget : `${linkTarget}${closing}`;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + linkTarget.length + closing.length },
        annotations: pickedCompletion.of(completion),
        userEvent: 'input.complete',
      });
    },
  };
}

/** Best matches first (title or name starting with the query, then containing it, then every word found). */
function rankTargets(
  targets: readonly LinkTargetDto[],
  query: string,
  preferAssets: boolean,
): readonly LinkTargetDto[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const words = normalizedQuery.split(/[\s\-_/.]+/).filter(Boolean);
  const scored: { target: LinkTargetDto; score: number }[] = [];

  for (const target of targets) {
    const title = target.title.toLocaleLowerCase();
    const name = target.name.toLocaleLowerCase();
    const path = target.path.toLocaleLowerCase();
    let score: number;
    if (!normalizedQuery || title.startsWith(normalizedQuery) || name.startsWith(normalizedQuery)) {
      score = 3;
    } else if (title.includes(normalizedQuery) || name.includes(normalizedQuery)) {
      score = 2;
    } else if (words.every((word) => title.includes(word) || path.includes(word))) {
      score = 1;
    } else {
      continue;
    }

    // Embeds list assets first, links list notes first.
    const isPreferredKind = (target.kind === 'asset') === preferAssets;
    scored.push({ target, score: score + (isPreferredKind ? 10 : 0) });
  }

  // Stable sort: equal scores keep the index order (by title).
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_OPTIONS)
    .map((entry) => entry.target);
}

/** Link names used by more than one file of the scope: those links need the path to stay unambiguous. */
function findDuplicateNames(targets: readonly LinkTargetDto[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const target of targets) {
    const name = target.name.toLocaleLowerCase();
    if (seen.has(name)) {
      duplicates.add(name);
    }
    seen.add(name);
  }
  return duplicates;
}

/** `[[name]]`, or `[[folder/name]]` (scope-relative, resolved by path suffix) when the name is not unique. */
function getWikilinkTarget(
  target: LinkTargetDto,
  scopePrefix: string,
  duplicateNames: ReadonlySet<string>,
): string {
  if (!duplicateNames.has(target.name.toLocaleLowerCase())) {
    return target.name;
  }

  const scopePath = target.path.startsWith(scopePrefix)
    ? target.path.slice(scopePrefix.length)
    : target.path;
  return target.kind === 'md' && scopePath.endsWith(MARKDOWN_EXTENSION)
    ? scopePath.slice(0, -MARKDOWN_EXTENSION.length)
    : scopePath;
}

/** Markdown links resolve relative to the note's folder; parentheses are encoded so they don't end the link. */
function toMarkdownHref(sourceDir: readonly string[], targetPath: string): string {
  const targetSegments = targetPath.split('/');
  let common = 0;
  while (
    common < sourceDir.length &&
    common < targetSegments.length - 1 &&
    sourceDir[common] === targetSegments[common]
  ) {
    common++;
  }

  const relative = [
    ...Array<string>(sourceDir.length - common).fill('..'),
    ...targetSegments.slice(common),
  ].join('/');
  return encodeURI(relative).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** `<campaign>/` or `compendium/<system>/`: the folder the note's links resolve in. */
function getScopePrefix(sourcePath: string): string {
  const segments = sourcePath.split('/');
  const depth = segments[0] === COMPENDIUM_DIR_NAME ? 2 : 1;
  return segments.length > depth ? `${segments.slice(0, depth).join('/')}/` : '';
}

const completionTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    border: '1px solid var(--border)',
    backgroundColor: 'var(--popover)',
    color: 'var(--foreground)',
    boxShadow: '0 8px 24px color-mix(in oklch, black 25%, transparent)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    minWidth: '18rem',
    maxWidth: '32rem',
    maxHeight: '18rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    padding: '6px 12px',
    lineHeight: '1.4',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--primary)',
    boxShadow: 'inset 2px 0 0 var(--primary)',
  },
  '.cm-completionLabel': {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontStyle: 'normal',
    color: 'var(--muted-foreground)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
});
