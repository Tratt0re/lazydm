import type { DocumentLinkDto, LinkTargetDto } from '@/dtos';

const MARKDOWN_EXTENSION = '.md';
/** `[[target]]` / `![[target]]`, as the electron parser reads them. */
const WIKILINK_PATTERN = /(!?)\[\[([^[\]\n]+?)\]\]/g;
/** `[label](href)` / `![alt](href)`; external URLs and `#heading` links are not vault links. */
const MARKDOWN_LINK_PATTERN = /(!?)\[[^[\]\n]*\]\(([^()\s]+)\)/g;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const FENCE_PATTERN = /^\s*(```|~~~)/;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;

/** Names compare composed and lowercase: the disk may hold `e` + accent where the link has `é` (as the index does). */
function toLinkKey(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase();
}

/** Link name of a target path: the file name, without `.md` for notes (as the index stores it). */
function toLinkName(targetPath: string): string {
  const baseName = targetPath.split('/').pop() ?? '';
  return baseName.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION)
    ? baseName.slice(0, -MARKDOWN_EXTENSION.length)
    : baseName;
}

/** `a/./b/../c` → `a/c` (a markdown link's path relative to the note). */
function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part && part !== '.') {
      parts.push(part);
    }
  }
  return parts.join('/');
}

/**
 * The file a link resolves to among the files of the note's scope, with the index's rules (`resolveLinks`
 * in the vault index): exact path, then path suffix (`enemies/grimlock`), then the name, then the shortest
 * path. Null when nothing matches.
 */
function resolveTarget(targets: readonly LinkTargetDto[], targetPath: string): string | null {
  const name = toLinkKey(toLinkName(targetPath));
  const key = toLinkKey(targetPath);
  const withExtension = `${key}${MARKDOWN_EXTENSION}`;
  const isSuffix = (path: string) => path.endsWith(`/${key}`) || path.endsWith(`/${withExtension}`);
  const rank = (path: string) => {
    const pathKey = toLinkKey(path);
    return pathKey === key || pathKey === withExtension ? 2 : isSuffix(pathKey) ? 1 : 0;
  };

  let best: LinkTargetDto | null = null;
  for (const target of targets) {
    if (rank(target.path) === 0 && toLinkKey(target.name) !== name) {
      continue;
    }
    if (
      !best ||
      rank(target.path) > rank(best.path) ||
      (rank(target.path) === rank(best.path) && target.path.length < best.path.length)
    ) {
      best = target;
    }
  }
  return best?.path ?? null;
}

/**
 * The links written in a note's current text (not yet saved), resolved against the files of its scope: what
 * the live preview and the reading view show before the index has seen the edits. Code blocks and inline
 * code are skipped, as the electron parser does. A target the scope list does not have (the list is still
 * loading, say) keeps the index's answer for that link.
 */
export function resolveDocumentLinks(
  content: string,
  sourcePath: string,
  targets: readonly LinkTargetDto[],
  indexedLinks: readonly DocumentLinkDto[],
): DocumentLinkDto[] {
  const indexedByRaw = new Map(indexedLinks.map((link) => [link.raw, link]));
  const sourceDir = sourcePath.split('/').slice(0, -1).join('/');
  const links: DocumentLinkDto[] = [];
  let fence: string | null = null;

  const add = (
    raw: string,
    kind: DocumentLinkDto['kind'],
    targetPath: string,
    heading: string | null,
  ) => {
    const indexed = indexedByRaw.get(raw);
    const resolvedPath =
      targetPath === ''
        ? sourcePath
        : (resolveTarget(targets, targetPath) ?? indexed?.resolvedPath ?? null);
    links.push({
      raw,
      kind,
      targetName: targetPath === '' ? '' : toLinkName(targetPath),
      heading,
      resolvedPath,
      resolvedTitle:
        targets.find((target) => target.path === resolvedPath)?.title ??
        indexed?.resolvedTitle ??
        null,
    });
  };

  for (const line of content.split('\n')) {
    const fenceMatch = FENCE_PATTERN.exec(line);
    if (fenceMatch) {
      fence = fence === null ? fenceMatch[1] : fence === fenceMatch[1] ? null : fence;
      continue;
    }
    if (fence !== null) {
      continue;
    }

    const text = line.replace(INLINE_CODE_PATTERN, (code) => ' '.repeat(code.length));
    for (const match of text.matchAll(WIKILINK_PATTERN)) {
      const raw = match[2];
      const [rawPath, ...headingParts] = raw.split('|')[0].split('#');
      const heading = headingParts.join('#').trim();
      add(raw, match[1] ? 'embed' : 'wikilink', rawPath.trim(), heading || null);
    }
    for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
      const href = match[2];
      if (URL_SCHEME_PATTERN.test(href) || href.startsWith('#')) {
        continue;
      }
      let decoded = href;
      try {
        decoded = decodeURI(href);
      } catch {
        // keep the raw href when it is not valid URI encoding
      }
      const [rawPath, ...headingParts] = decoded.split('#');
      const heading = headingParts.join('#').trim();
      add(
        href,
        match[1] ? 'embed' : 'markdown',
        normalizePath(sourceDir ? `${sourceDir}/${rawPath}` : rawPath),
        heading || null,
      );
    }
  }

  return links;
}
