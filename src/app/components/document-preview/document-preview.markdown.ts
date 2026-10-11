import MarkdownIt, {
  type Env,
  type MarkdownIt as MarkdownItInstance,
  type RendererRule,
  type StateInline,
  type Token,
} from 'markdown-it';

import type { DocumentLinkDto } from '@/dtos';

const WIKILINK_PATTERN = /^(!?)\[\[([^[\]\n]+?)\]\]/;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const ASSET_PROTOCOL = 'lazydm-asset://vault';

export interface RenderMarkdownOptions {
  /** Links of the document, in the exact order `parseMarkdownDocument` found them (electron side). */
  readonly links: readonly DocumentLinkDto[];
  /** Vault-relative path of the note being rendered, used to tell same-note heading links apart. */
  readonly sourcePath: string;
}

interface WikilinkTokenMeta {
  readonly isEmbed: boolean;
  readonly resolvedPath: string | null;
  readonly targetName: string;
  readonly heading: string | null;
  readonly label: string | null;
  readonly sourcePath: string;
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

/** Vault paths look like `<campaign>/<section>/<name>.md`; only that shape is browsable in-app so far. */
function toInAppNoteRoute(resolvedPath: string): string | null {
  const segments = resolvedPath.split('/');
  if (segments.length !== 3 || !segments[2].toLocaleLowerCase().endsWith('.md')) {
    return null;
  }

  const [campaignSlug, section, fileName] = segments;
  const noteSlug = fileName.slice(0, -'.md'.length);
  return `/campaigns/${campaignSlug}/${section}/${noteSlug}`;
}

function renderWikilinkToken(token: Token): string {
  const { isEmbed, resolvedPath, targetName, heading, label, sourcePath } =
    token.meta as unknown as WikilinkTokenMeta;
  const displayText = escapeHtml(
    label ?? (heading ? `${targetName} > ${heading}` : targetName || 'this note'),
  );

  if (isEmbed && resolvedPath && IMAGE_EXTENSION_PATTERN.test(resolvedPath)) {
    const src = `${ASSET_PROTOCOL}/${resolvedPath.split('/').map(encodeURIComponent).join('/')}`;
    return `<img class="arc-embed-image" src="${src}" alt="${displayText}" loading="lazy" />`;
  }

  if (isEmbed) {
    return `<span class="arc-embed-missing" title="${displayText}">📎 ${displayText}</span>`;
  }

  if (!resolvedPath) {
    return `<span class="arc-wikilink arc-wikilink-broken" title="Note not found: ${escapeHtml(targetName)}">${displayText}</span>`;
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
    const env = state.env as unknown as { links: DocumentLinkDto[]; sourcePath: string };
    const link = env.links.shift();
    const token = state.push('wikilink', '', 0);
    const meta: WikilinkTokenMeta = {
      isEmbed: match[1] === '!',
      resolvedPath: link?.resolvedPath ?? null,
      targetName: link?.targetName ?? match[2].split('|')[0].split('#')[0],
      heading: link?.heading ?? null,
      label: link?.raw.includes('|') ? link.raw.split('|').slice(1).join('|') : null,
      sourcePath: env.sourcePath,
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

function createRenderer(): MarkdownItInstance {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.renderer.rules['wikilink'] = (tokens, index) => renderWikilinkToken(tokens[index]);

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
  const env = { links: [...options.links], sourcePath: options.sourcePath } as unknown as Env;
  return markdownRenderer.render(body, env);
}
