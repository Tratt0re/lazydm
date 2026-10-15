import DOMPurify from 'dompurify';
import MarkdownIt, {
  type Env,
  type MarkdownIt as MarkdownItInstance,
  type RendererRule,
  type StateCore,
  type StateInline,
  type Token,
} from 'markdown-it';

import type { DocumentLinkDto } from '@/dtos';

const WIKILINK_PATTERN = /^(!?)\[\[([^[\]\n]+?)\]\]/;
export const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const ASSET_PROTOCOL = 'lazydm-asset://vault';
/** Obsidian callout header: `> [!warning] Optional title` (`+` / `-` fold markers are accepted). */
const CALLOUT_PATTERN = /^\[!([A-Za-z][\w-]*)\][+-]?[ \t]*(.*)$/;

const SANITIZE_OPTIONS: { readonly ADD_TAGS: string[]; readonly ADD_ATTR: string[] } = {
  ADD_TAGS: ['img'],
  ADD_ATTR: ['loading', 'target', 'rel'],
};

/** URL of a vault file served by the app's asset protocol (images in notes, embeds). */
export function toAssetUrl(vaultPath: string): string {
  return `${ASSET_PROTOCOL}/${vaultPath.split('/').map(encodeURIComponent).join('/')}`;
}

export interface RenderMarkdownOptions {
  /** Links of the document, in the exact order `parseMarkdownDocument` found them (electron side). */
  readonly links: readonly DocumentLinkDto[];
  /** Vault-relative path of the note being rendered, used to tell same-note heading links apart. */
  readonly sourcePath: string;
  /** Accessible names of the audio / PDF rows' controls, in the UI language. */
  readonly mediaLabels?: MediaEmbedLabels;
}

/** Accessible names of the controls of an embedded audio (play/stop toggle) or PDF (open) row. */
export interface MediaEmbedLabels {
  readonly play: string;
  readonly open: string;
}

const DEFAULT_MEDIA_LABELS: MediaEmbedLabels = { play: 'Play', open: 'Open' };
const AUDIO_EXTENSION_PATTERN = /\.(mp3|wav|ogg|m4a|flac)$/i;
const PDF_EXTENSION_PATTERN = /\.pdf$/i;
const SVG_ATTRIBUTES =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
/** Lucide `play`, `square` and `file-text`, inline: the rows are plain HTML in both views. */
const PLAY_ICON = `<svg class="arc-embed-file-play" ${SVG_ATTRIBUTES}><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const STOP_ICON = `<svg class="arc-embed-file-stop" ${SVG_ATTRIBUTES}><rect x="5" y="5" width="14" height="14"/></svg>`;
const FILE_ICON = `<svg class="arc-embed-file-icon" ${SVG_ATTRIBUTES}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;

/** An embed shown as a media row rather than an image: audio or PDF (null for anything else). */
export function getMediaEmbedKind(path: string): 'audio' | 'pdf' | null {
  return AUDIO_EXTENSION_PATTERN.test(path) ? 'audio' : PDF_EXTENSION_PATTERN.test(path) ? 'pdf' : null;
}

/**
 * HTML of an embedded audio or PDF: a row with its name. Audio has a play/stop toggle (`data-playing` set
 * while it plays); a PDF row opens the file in the system viewer. Clicks are handled by the view through
 * `data-asset-action` / `data-asset-path`. Shared by the reading view and the live preview.
 */
export function renderMediaEmbedHtml(
  kind: 'audio' | 'pdf',
  path: string,
  name: string,
  labels: MediaEmbedLabels = DEFAULT_MEDIA_LABELS,
  isPlaying = false,
): string {
  const assetPath = escapeHtml(path);
  const label = escapeHtml(name);
  if (kind === 'pdf') {
    return `<button type="button" class="arc-embed-file" data-asset-kind="pdf" data-asset-action="open" data-asset-path="${assetPath}" title="${escapeHtml(labels.open)}: ${label}">${FILE_ICON}<span class="arc-embed-file-name">${label}</span></button>`;
  }

  return `<span class="arc-embed-file" data-asset-kind="audio" data-asset-path="${assetPath}" data-playing="${isPlaying}"><button type="button" class="arc-embed-file-button" data-asset-action="toggle-audio" aria-pressed="${isPlaying}" aria-label="${escapeHtml(labels.play)}: ${label}">${PLAY_ICON}${STOP_ICON}</button><span class="arc-embed-file-name">${label}</span></span>`;
}

interface WikilinkTokenMeta {
  readonly isEmbed: boolean;
  /** Raw target as written between the brackets (`name#heading|label`). */
  readonly raw: string;
  readonly resolvedPath: string | null;
  readonly targetName: string;
  readonly heading: string | null;
  readonly label: string | null;
  readonly sourcePath: string;
  readonly mediaLabels?: MediaEmbedLabels;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char,
  );
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

const COMPENDIUM_DIR_NAME = 'compendium';

/** Where a vault file sits: its scope (campaign or compendium system), section folder and file name. */
export interface VaultFileLocation {
  /** `lost-mine` or `compendium/my-system`. */
  readonly scopePath: string;
  /** In-app route of the scope: `/campaigns/lost-mine` or `/compendium/my-system`. */
  readonly scopeRoute: string;
  readonly section: string;
  /** Sub-folder of the section (the note's sub-type), null directly in the section. */
  readonly subfolder: string | null;
  /** File name without `.md` for notes, with its extension for other files. */
  readonly name: string;
  readonly isNote: boolean;
}

/** Browsable shapes: `<campaign>/<section>/<file>` and `compendium/<system>/<section>/<file>`. */
export function parseVaultFilePath(path: string): VaultFileLocation | null {
  const segments = path.split('/');
  const isCompendium = segments[0] === COMPENDIUM_DIR_NAME;
  const scopeDepth = isCompendium ? 2 : 1;
  // `<scope>/<section>/<file>` or one sub-folder deeper; deeper files are not shown by the app.
  if (segments.length !== scopeDepth + 2 && segments.length !== scopeDepth + 3) {
    return null;
  }

  const scopePath = segments.slice(0, scopeDepth).join('/');
  const fileName = segments[segments.length - 1];
  const isNote = fileName.toLocaleLowerCase().endsWith('.md');
  return {
    scopePath,
    scopeRoute: isCompendium ? `/${scopePath}` : `/campaigns/${scopePath}`,
    section: segments[scopeDepth],
    subfolder: segments.length === scopeDepth + 3 ? segments[scopeDepth + 1] : null,
    name: isNote ? fileName.slice(0, -'.md'.length) : fileName,
    isNote,
  };
}

/** In-app route of a note of a campaign or of a compendium system, null for anything else. */
export function toInAppNoteRoute(resolvedPath: string): string | null {
  const location = parseVaultFilePath(resolvedPath);
  if (!location?.isNote) {
    return null;
  }

  const folder = location.subfolder
    ? `${location.section}/${location.subfolder}`
    : location.section;
  return `${location.scopeRoute}/${folder}/${location.name}`;
}

/** In-app route of an image of a campaign or of a compendium system (its asset page), null for anything else. */
export function toInAppAssetRoute(resolvedPath: string): string | null {
  const location = parseVaultFilePath(resolvedPath);
  if (!location || location.isNote || !IMAGE_EXTENSION_PATTERN.test(location.name)) {
    return null;
  }

  const folder = location.subfolder
    ? `${location.section}/${location.subfolder}`
    : location.section;
  return `${location.scopeRoute}/${folder}/${location.name}`;
}

function renderWikilinkToken(token: Token): string {
  const { isEmbed, raw, resolvedPath, targetName, heading, label, sourcePath, mediaLabels } =
    token.meta as unknown as WikilinkTokenMeta;
  const displayText = escapeHtml(
    label ?? (heading ? `${targetName} > ${heading}` : targetName || 'this note'),
  );

  if (isEmbed && resolvedPath && IMAGE_EXTENSION_PATTERN.test(resolvedPath)) {
    const src = toAssetUrl(resolvedPath);
    return `<img class="arc-embed-image" src="${src}" alt="${displayText}" loading="lazy" />`;
  }

  const mediaKind = isEmbed && resolvedPath ? getMediaEmbedKind(resolvedPath) : null;
  if (mediaKind && resolvedPath) {
    return renderMediaEmbedHtml(mediaKind, resolvedPath, label ?? targetName, mediaLabels);
  }

  if (isEmbed) {
    return `<span class="arc-embed-missing" title="${displayText}">📎 ${displayText}</span>`;
  }

  if (!resolvedPath) {
    // A menu trigger: the preview offers to create the note or turn the link into plain text.
    return `<span class="arc-wikilink arc-wikilink-broken" role="button" tabindex="0" aria-haspopup="menu" data-broken-raw="${escapeHtml(raw)}" data-broken-target="${escapeHtml(targetName)}" title="Note not found: ${escapeHtml(targetName)}">${displayText}</span>`;
  }

  // Same note: a plain in-page anchor jump, so it works without any router navigation.
  if (resolvedPath === sourcePath) {
    const anchor = heading ? slugifyHeading(heading) : '';
    return `<a class="arc-wikilink" href="#${anchor}">${displayText}</a>`;
  }

  const route = toInAppNoteRoute(resolvedPath);
  if (route) {
    return `<a class="arc-wikilink" data-route="${escapeHtml(route)}" href="javascript:void(0)">${displayText}</a>`;
  }

  // Resolved (e.g. the vault-level compendium), but there's no browsing UI for it yet.
  return `<span class="arc-wikilink arc-wikilink-external" title="${escapeHtml(resolvedPath)}">${displayText}</span>`;
}

/** Matches `[[...]]`/`![[...]]` and pairs each occurrence, in order, with the resolved link data from `env.links`. */
function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const match = WIKILINK_PATTERN.exec(state.src.slice(state.pos));
  if (!match) {
    return false;
  }

  if (!silent) {
    const env = state.env as unknown as {
      links: DocumentLinkDto[];
      sourcePath: string;
      mediaLabels?: MediaEmbedLabels;
    };
    const link = env.links.shift();
    const token = state.push('wikilink', '', 0);
    const meta: WikilinkTokenMeta = {
      isEmbed: match[1] === '!',
      raw: link?.raw ?? match[2],
      resolvedPath: link?.resolvedPath ?? null,
      targetName: link?.targetName ?? match[2].split('|')[0].split('#')[0],
      heading: link?.heading ?? null,
      label: link?.raw.includes('|') ? link.raw.split('|').slice(1).join('|') : null,
      sourcePath: env.sourcePath,
      mediaLabels: env.mediaLabels,
    };
    token.meta = meta as unknown as Record<string, unknown>;
  }

  state.pos += match[0].length;
  return true;
}

function headingPermalinkRule(originalRule: RendererRule): RendererRule {
  return (tokens, index, options, env, renderer) => {
    const headingToken = tokens[index];
    const inlineToken = tokens[index + 1];
    if (inlineToken?.type === 'inline') {
      headingToken.attrSet('id', slugifyHeading(inlineToken.content));
    }

    return originalRule(tokens, index, options, env, renderer);
  };
}

const renderTokenAsIs: RendererRule = (tokens, index, options, _env, self) =>
  self.renderToken(tokens, index, options);

interface CalloutMeta {
  readonly calloutType: string;
  readonly calloutTitle: string;
}

/**
 * Turns `> [!type] Title` blockquotes into callouts: runs after block parsing (before inline parsing),
 * drops the header line from the quote and marks the open/close tokens for the renderer.
 */
function calloutRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length; index++) {
    const inlineToken = tokens[index + 2];
    if (
      tokens[index].type !== 'blockquote_open' ||
      tokens[index + 1]?.type !== 'paragraph_open' ||
      inlineToken?.type !== 'inline'
    ) {
      continue;
    }

    const [headerLine, ...bodyLines] = inlineToken.content.split('\n');
    const match = CALLOUT_PATTERN.exec(headerLine.trim());
    if (!match) {
      continue;
    }

    const calloutType = match[1].toLocaleLowerCase();
    tokens[index].meta = {
      calloutType,
      calloutTitle: match[2] || calloutType,
    } satisfies CalloutMeta;
    inlineToken.content = bodyLines.join('\n');

    let depth = 0;
    for (let closeIndex = index; closeIndex < tokens.length; closeIndex++) {
      depth +=
        tokens[closeIndex].type === 'blockquote_open'
          ? 1
          : tokens[closeIndex].type === 'blockquote_close'
            ? -1
            : 0;
      if (depth === 0) {
        tokens[closeIndex].meta = { calloutType };
        break;
      }
    }
  }
}

function createRenderer(): MarkdownItInstance {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.renderer.rules['wikilink'] = (tokens, index) => renderWikilinkToken(tokens[index]);

  md.core.ruler.after('block', 'callout', calloutRule);
  const defaultBlockquoteOpen = md.renderer.rules['blockquote_open'] ?? renderTokenAsIs;
  const defaultBlockquoteClose = md.renderer.rules['blockquote_close'] ?? renderTokenAsIs;
  md.renderer.rules['blockquote_open'] = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta as CalloutMeta | null;
    return meta?.calloutTitle
      ? `<div class="arc-callout" data-callout="${escapeHtml(meta.calloutType)}"><div class="arc-callout-title">${escapeHtml(meta.calloutTitle)}</div><div class="arc-callout-body">`
      : defaultBlockquoteOpen(tokens, index, options, env, self);
  };
  md.renderer.rules['blockquote_close'] = (tokens, index, options, env, self) =>
    (tokens[index].meta as CalloutMeta | null)?.calloutType
      ? '</div></div>'
      : defaultBlockquoteClose(tokens, index, options, env, self);

  const defaultHeadingOpen = md.renderer.rules['heading_open'] ?? renderTokenAsIs;
  md.renderer.rules['heading_open'] = headingPermalinkRule(defaultHeadingOpen);

  const defaultLinkOpen = md.renderer.rules['link_open'] ?? renderTokenAsIs;
  md.renderer.rules['link_open'] = (tokens, index, options, env, self) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  return md;
}

const markdownRenderer = createRenderer();

/** Renders a note body to HTML. The result still needs sanitizing before it is trusted in the DOM. */
export function renderMarkdownBody(body: string, options: RenderMarkdownOptions): string {
  const env = {
    links: [...options.links],
    sourcePath: options.sourcePath,
    mediaLabels: options.mediaLabels,
  } as unknown as Env;
  return markdownRenderer.render(body, env);
}

/** `renderMarkdownBody` sanitized for `innerHTML` (reading view, live-preview widgets). */
export function renderMarkdownToSafeHtml(body: string, options: RenderMarkdownOptions): string {
  return DOMPurify.sanitize(renderMarkdownBody(body, options), SANITIZE_OPTIONS);
}
