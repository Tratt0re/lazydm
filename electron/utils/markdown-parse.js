const path = require('node:path');
const YAML = require('yaml');

const FRONTMATTER_OPEN = '---';
const FRONTMATTER_CLOSE = new Set(['---', '...']);
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const WIKILINK_PATTERN = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
const INLINE_TAG_PATTERN = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const MARKDOWN_EXTENSION = '.md';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNewlines(text) {
  return String(text ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n');
}

function splitFrontmatter(text) {
  const lines = normalizeNewlines(text).split('\n');
  if (lines[0]?.trim() !== FRONTMATTER_OPEN) {
    return { frontmatterText: null, bodyLines: lines, bodyStartLine: 1 };
  }

  const closeIndex = lines.findIndex((line, index) => index > 0 && FRONTMATTER_CLOSE.has(line.trim()));
  if (closeIndex === -1) {
    return { frontmatterText: null, bodyLines: lines, bodyStartLine: 1 };
  }

  return {
    frontmatterText: lines.slice(1, closeIndex).join('\n'),
    bodyLines: lines.slice(closeIndex + 1),
    bodyStartLine: closeIndex + 2,
  };
}

function parseFrontmatter(frontmatterText) {
  if (frontmatterText === null || frontmatterText.trim().length === 0) {
    return { data: {}, error: null };
  }

  try {
    const parsed = YAML.parse(frontmatterText);
    if (parsed === null || parsed === undefined) {
      return { data: {}, error: null };
    }

    return isPlainObject(parsed)
      ? { data: parsed, error: null }
      : { data: {}, error: 'Frontmatter is not a key/value mapping.' };
  } catch (error) {
    return { data: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .toLocaleLowerCase();
}

function toTagList(value) {
  const rawTags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  return rawTags.map(normalizeTag).filter((tag) => tag.length > 0);
}

function toLinkName(targetPath) {
  const baseName = path.posix.basename(targetPath);
  return baseName.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION)
    ? baseName.slice(0, -MARKDOWN_EXTENSION.length)
    : baseName;
}

function parseWikilink(isEmbed, inner, line) {
  const [targetPart, ...labelParts] = inner.split('|');
  const [rawPath, ...headingParts] = targetPart.split('#');
  const targetPath = rawPath.trim();
  const heading = headingParts.join('#').trim();

  return {
    kind: isEmbed ? 'embed' : 'wikilink',
    syntax: 'wikilink',
    raw: inner,
    targetPath: targetPath.length > 0 ? targetPath : null,
    targetName: targetPath.length > 0 ? toLinkName(targetPath) : '',
    heading: heading.length > 0 ? heading : null,
    label: labelParts.length > 0 ? labelParts.join('|').trim() : null,
    line,
  };
}

function parseMarkdownLink(isEmbed, label, href, sourceDir, line) {
  if (URL_SCHEME_PATTERN.test(href) || href.startsWith('#')) {
    return null;
  }

  let decodedHref = href;
  try {
    decodedHref = decodeURI(href);
  } catch (_) {
    // keep the raw href when it is not valid URI encoding
  }

  const [rawPath, ...headingParts] = decodedHref.split('#');
  const targetPath = path.posix.normalize(path.posix.join(sourceDir, rawPath));
  const heading = headingParts.join('#').trim();

  return {
    kind: isEmbed ? 'embed' : 'markdown',
    syntax: 'markdown',
    raw: href,
    targetPath,
    targetName: toLinkName(targetPath),
    heading: heading.length > 0 ? heading : null,
    label: label.trim().length > 0 ? label.trim() : null,
    line,
  };
}

/**
 * Parses a markdown document into the data the vault index stores.
 * Content inside fenced code blocks and inline code is ignored, like Obsidian does.
 *
 * @param {string} text - Raw file content.
 * @param {{ sourcePath?: string }} [options] - Vault-relative POSIX path of the document, used for relative links.
 */
function parseMarkdownDocument(text, options = {}) {
  const sourceDir = path.posix.dirname(options.sourcePath ?? '');
  const { frontmatterText, bodyLines, bodyStartLine } = splitFrontmatter(text);
  const { data: frontmatter, error: frontmatterError } = parseFrontmatter(frontmatterText);

  const headings = [];
  const links = [];
  const tags = new Set(toTagList(frontmatter.tags ?? frontmatter.tag));
  let fenceMarker = null;

  bodyLines.forEach((rawLine, index) => {
    const line = bodyStartLine + index;
    const fenceMatch = rawLine.match(FENCE_PATTERN);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fenceMarker = fenceMarker === null ? marker : fenceMarker === marker ? null : fenceMarker;
      return;
    }

    if (fenceMarker !== null) {
      return;
    }

    const headingMatch = rawLine.match(HEADING_PATTERN);
    if (headingMatch) {
      headings.push({ level: headingMatch[1].length, text: headingMatch[2], line });
    }

    const codeFreeLine = rawLine.replace(INLINE_CODE_PATTERN, '');

    for (const match of codeFreeLine.matchAll(WIKILINK_PATTERN)) {
      links.push(parseWikilink(match[1] === '!', match[2], line));
    }

    for (const match of codeFreeLine.matchAll(MARKDOWN_LINK_PATTERN)) {
      const link = parseMarkdownLink(match[1] === '!', match[2], match[3], sourceDir, line);
      if (link) {
        links.push(link);
      }
    }

    for (const match of codeFreeLine.matchAll(INLINE_TAG_PATTERN)) {
      tags.add(normalizeTag(match[2]));
    }
  });

  const frontmatterTitle = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
  const firstTopHeading = headings.find((heading) => heading.level === 1);
  const type = typeof frontmatter.type === 'string' ? frontmatter.type.trim().toLocaleLowerCase() : '';

  return {
    frontmatter,
    frontmatterError,
    body: bodyLines.join('\n'),
    title: frontmatterTitle || firstTopHeading?.text || null,
    type: type || null,
    tags: [...tags],
    headings,
    links: links.filter((link) => link.targetName.length > 0 || link.heading !== null),
  };
}

function detectNewline(text) {
  return String(text ?? '').includes('\r\n') ? '\r\n' : '\n';
}

function splitBom(text) {
  const value = String(text ?? '');
  return value.startsWith('\uFEFF') ? ['\uFEFF', value.slice(1)] : ['', value];
}

function getRanges(line, pattern) {
  return [...line.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
}

function isInsideRanges(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Rewrites links of a markdown document in place. `replace(link)` receives each link parsed the way
 * `parseMarkdownDocument` does (so code blocks, inline code and frontmatter are skipped) and returns
 * the new raw target (`raw` of the link) or null to leave it untouched. Line endings are preserved.
 *
 * @param {string} text - Raw file content.
 * @param {(link: ReturnType<typeof parseWikilink>) => string|null} replace - New raw target, or null.
 * @param {{ sourcePath?: string }} [options] - Vault-relative path of the document, used for relative links.
 * @returns {{ content: string, count: number }} The rewritten content and the number of links changed.
 */
function rewriteLinks(text, replace, options = {}) {
  const sourceDir = path.posix.dirname(options.sourcePath ?? '');
  const newline = detectNewline(text);
  const [bom, content] = splitBom(text);
  const lines = normalizeNewlines(content).split('\n');
  const { bodyStartLine } = splitFrontmatter(content);
  let fenceMarker = null;
  let count = 0;

  const rewrittenLines = lines.map((rawLine, index) => {
    if (index + 1 < bodyStartLine) {
      return rawLine;
    }

    const fenceMatch = rawLine.match(FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fenceMarker = fenceMarker === null ? marker : fenceMarker === marker ? null : fenceMarker;
      return rawLine;
    }

    if (fenceMarker !== null) {
      return rawLine;
    }

    const codeRanges = getRanges(rawLine, INLINE_CODE_PATTERN);
    const replacements = [];

    for (const match of rawLine.matchAll(WIKILINK_PATTERN)) {
      if (isInsideRanges(match.index, codeRanges)) {
        continue;
      }

      const newRaw = replace(parseWikilink(match[1] === '!', match[2], index + 1));
      if (typeof newRaw === 'string' && newRaw !== match[2]) {
        replacements.push({ start: match.index, end: match.index + match[0].length, text: `${match[1]}[[${newRaw}]]` });
      }
    }

    for (const match of rawLine.matchAll(MARKDOWN_LINK_PATTERN)) {
      if (isInsideRanges(match.index, codeRanges)) {
        continue;
      }

      const link = parseMarkdownLink(match[1] === '!', match[2], match[3], sourceDir, index + 1);
      const newRaw = link ? replace(link) : null;
      if (typeof newRaw === 'string' && newRaw !== match[3]) {
        const hrefStart = match[0].indexOf(match[3], match[0].indexOf('](') + 2);
        const text = `${match[0].slice(0, hrefStart)}${newRaw}${match[0].slice(hrefStart + match[3].length)}`;
        replacements.push({ start: match.index, end: match.index + match[0].length, text });
      }
    }

    count += replacements.length;
    return replacements
      .sort((left, right) => right.start - left.start)
      .reduce((line, { start, end, text }) => `${line.slice(0, start)}${text}${line.slice(end)}`, rawLine);
  });

  return { content: `${bom}${rewrittenLines.join(newline)}`, count };
}

/** Swaps the file name at the end of a link path (`monsters/old.md`, `old`), keeping folders, `.md` and spacing. */
function replaceLinkFileName(linkPath, oldName, newName, { encoded = false } = {}) {
  const [, leading, inner, trailing] = linkPath.match(/^(\s*)(.*?)(\s*)$/);
  const nameStart = inner.lastIndexOf('/') + 1;
  const fileName = inner.slice(nameStart);
  const extension = fileName.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION)
    ? fileName.slice(-MARKDOWN_EXTENSION.length)
    : '';
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;

  let comparableName = baseName;
  if (encoded) {
    try {
      comparableName = decodeURIComponent(baseName);
    } catch (_) {
      // keep the raw name when it is not valid URI encoding
    }
  }

  if (comparableName.toLocaleLowerCase() !== oldName.toLocaleLowerCase()) {
    return null;
  }

  const replacementName = encoded && baseName.includes('%') ? encodeURIComponent(newName) : newName;
  return `${leading}${inner.slice(0, nameStart)}${replacementName}${extension}${trailing}`;
}

/**
 * New raw target of a link after its note was renamed from `oldName` to `newName` (file names without
 * `.md`; the folder does not change). Keeps the link's own form: bare name, path, `.md`, `#heading`, `|alias`.
 * Returns null when the link does not end with the old file name.
 */
function renameLinkTarget(link, oldName, newName) {
  if (link.syntax === 'markdown') {
    const hashIndex = link.raw.indexOf('#');
    const linkPath = hashIndex < 0 ? link.raw : link.raw.slice(0, hashIndex);
    const suffix = hashIndex < 0 ? '' : link.raw.slice(hashIndex);
    const renamedPath = replaceLinkFileName(linkPath, oldName, newName, { encoded: true });
    return renamedPath === null ? null : `${renamedPath}${suffix}`;
  }

  const pipeIndex = link.raw.indexOf('|');
  const target = pipeIndex < 0 ? link.raw : link.raw.slice(0, pipeIndex);
  const alias = pipeIndex < 0 ? '' : link.raw.slice(pipeIndex);
  const hashIndex = target.indexOf('#');
  const linkPath = hashIndex < 0 ? target : target.slice(0, hashIndex);
  const heading = hashIndex < 0 ? '' : target.slice(hashIndex);
  const renamedPath = replaceLinkFileName(linkPath, oldName, newName);
  return renamedPath === null ? null : `${renamedPath}${heading}${alias}`;
}

/**
 * Sets the note title: the frontmatter `title:` (when there is a frontmatter) and the first `# Heading`
 * if it still shows the old title. Everything else, comments and key order included, stays as it is.
 *
 * @param {string} text - Raw file content.
 * @param {string|null} oldTitle - Title the note currently has.
 * @param {string} newTitle - Title to set.
 */
function replaceDocumentTitle(text, oldTitle, newTitle) {
  const newline = detectNewline(text);
  const [bom, content] = splitBom(text);
  const lines = normalizeNewlines(content).split('\n');
  const { frontmatterText, bodyStartLine } = splitFrontmatter(content);
  let outputLines = lines;

  if (frontmatterText !== null) {
    const frontmatter = YAML.parseDocument(frontmatterText);
    if (frontmatter.errors.length === 0 && (frontmatter.contents === null || YAML.isMap(frontmatter.contents))) {
      frontmatter.set('title', newTitle);
      const frontmatterLines = frontmatter.toString().replace(/\n$/, '').split('\n');
      outputLines = [lines[0], ...frontmatterLines, ...lines.slice(bodyStartLine - 2)];
    }
  }

  const bodyOffset = outputLines.length - (lines.length - (bodyStartLine - 1));
  let fenceMarker = null;
  for (let index = bodyOffset; index < outputLines.length; index++) {
    const line = outputLines[index];
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fenceMarker = fenceMarker === null ? marker : fenceMarker === marker ? null : fenceMarker;
      continue;
    }

    const headingMatch = fenceMarker === null ? line.match(HEADING_PATTERN) : null;
    if (headingMatch && headingMatch[1].length === 1) {
      if (oldTitle !== null && headingMatch[2] === oldTitle) {
        outputLines = [...outputLines];
        outputLines[index] = line.replace(oldTitle, newTitle);
      }
      break;
    }
  }

  return `${bom}${outputLines.join(newline)}`;
}

module.exports = {
  parseMarkdownDocument,
  renameLinkTarget,
  replaceDocumentTitle,
  rewriteLinks,
};
