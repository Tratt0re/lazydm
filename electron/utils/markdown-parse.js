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

module.exports = {
  parseMarkdownDocument,
};
