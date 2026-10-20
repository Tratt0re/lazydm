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

const SANITIZE_OPTIONS: {
  readonly ADD_TAGS: string[];
  readonly ADD_ATTR: string[];
  readonly ALLOWED_URI_REGEXP: RegExp;
} = {
  ADD_TAGS: ['img'],
  ADD_ATTR: ['loading', 'target', 'rel', 'data-path'],
  // DOMPurify's default URI list plus the vault asset protocol (images would otherwise lose their `src`).
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|lazydm-asset):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
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

/** Accessible names of the controls of an embedded audio (play/stop toggle, volume) or PDF (open) row. */
export interface MediaEmbedLabels {
  readonly play: string;
  readonly open: string;
  readonly volume: string;
}

const DEFAULT_MEDIA_LABELS: MediaEmbedLabels = { play: 'Play', open: 'Open', volume: 'Volume' };
export const AUDIO_EXTENSION_PATTERN = /\.(mp3|wav|ogg|m4a|flac)$/i;
const PDF_EXTENSION_PATTERN = /\.pdf$/i;
const SVG_ATTRIBUTES =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
/** Lucide `play`, `square`, `file-text` and `volume-2`, inline: the rows are plain HTML in both views. */
const PLAY_ICON = `<svg class="arc-embed-file-play" ${SVG_ATTRIBUTES}><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const STOP_ICON = `<svg class="arc-embed-file-stop" ${SVG_ATTRIBUTES}><rect x="5" y="5" width="14" height="14"/></svg>`;
const FILE_ICON = `<svg class="arc-embed-file-icon" ${SVG_ATTRIBUTES}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
/** Lucide `swords`, the battle icon of an embedded encounter. */
const SWORDS_ICON = `<svg class="arc-embed-file-icon" ${SVG_ATTRIBUTES}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>`;
const VOLUME_ICON = `<svg class="arc-embed-file-volume-icon" ${SVG_ATTRIBUTES}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;

/**
 * A task's checkbox (`- [ ]` / `- [x]`): the app's square box with a check, in Reading (read-only) and
 * the live preview (clickable). A styled span rather than an `<input>`, so both themes draw it alike.
 */
export function renderTaskBoxHtml(isChecked: boolean): string {
  return `<span class="arc-task-box" role="checkbox" aria-checked="${isChecked}" data-checked="${isChecked}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
}

/** What an embed row is: a sound, a PDF, or an encounter (opens its battle page). */
export type MediaEmbedKind = 'audio' | 'pdf' | 'encounter';

/** An embed shown as a row rather than an image: audio, PDF or encounter (null for anything else). */
export function getMediaEmbedKind(path: string): MediaEmbedKind | null {
  return AUDIO_EXTENSION_PATTERN.test(path)
    ? 'audio'
    : PDF_EXTENSION_PATTERN.test(path)
      ? 'pdf'
      : toInAppEncounterRoute(path)
        ? 'encounter'
        : null;
}

/**
 * `0:04` / `12:03`: minutes:seconds, no leading zero on the minutes. Lengths round up (`roundUp`), so a
 * sound of 0.9 s reads `0:01`, not `0:00`; elapsed time rounds down.
 */
export function formatDuration(totalSeconds: number, roundUp = false): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }

  const seconds = roundUp ? Math.ceil(totalSeconds) : Math.floor(totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Time of an audio row: its length while stopped, `elapsed / length` while it plays. */
function formatAudioTime(isPlaying: boolean, currentSeconds: number, durationSeconds: number): string {
  const length = formatDuration(durationSeconds, true);
  return isPlaying ? `${formatDuration(currentSeconds)} / ${length}` : length;
}

/**
 * HTML of an embedded audio or PDF: a row with its name. Audio has a play/stop toggle (`data-playing` set
 * while it plays), its time (the length, `elapsed / length` while playing) and a volume slider. A PDF row opens
 * the file in the system viewer. Clicks are handled by the view through `data-asset-action` /
 * `data-asset-path`. Shared by the reading view and the live preview.
 */
export function renderMediaEmbedHtml(
  kind: MediaEmbedKind,
  path: string,
  name: string,
  labels: MediaEmbedLabels = DEFAULT_MEDIA_LABELS,
  isPlaying = false,
  currentSeconds = 0,
  durationSeconds = NaN,
  volume = 1,
): string {
  const assetPath = escapeHtml(path);
  const label = escapeHtml(name);
  if (kind === 'encounter') {
    // A link to the battle page, like a note link: the views open its route (a new tab on Cmd/Ctrl-click).
    const route = escapeHtml(toInAppEncounterRoute(path) ?? '');
    return `<a class="arc-embed-file" data-asset-kind="encounter" data-route="${route}" data-path="${assetPath}" href="#" title="${escapeHtml(labels.open)}: ${label}">${SWORDS_ICON}<span class="arc-embed-file-name">${label}</span></a>`;
  }

  if (kind === 'pdf') {
    return `<button type="button" class="arc-embed-file" data-asset-kind="pdf" data-asset-action="open" data-asset-path="${assetPath}" title="${escapeHtml(labels.open)}: ${label}">${FILE_ICON}<span class="arc-embed-file-name">${label}</span></button>`;
  }

  const time = formatAudioTime(isPlaying, currentSeconds, durationSeconds);
  return (
    `<span class="arc-embed-file" data-asset-kind="audio" data-asset-path="${assetPath}" data-playing="${isPlaying}">` +
    `<button type="button" class="arc-embed-file-button" data-asset-action="toggle-audio" aria-pressed="${isPlaying}" aria-label="${escapeHtml(labels.play)}: ${label}">${PLAY_ICON}${STOP_ICON}</button>` +
    `<span class="arc-embed-file-name">${label}</span>` +
    `<span class="arc-embed-file-time">${time}</span>` +
    `${VOLUME_ICON}` +
    `<input type="range" class="arc-embed-file-volume" data-asset-action="set-volume" min="0" max="1" step="0.01" value="${volume}" style="--arc-volume: ${Math.round(volume * 100)}%" aria-label="${escapeHtml(labels.volume)}: ${label}" />` +
    `</span>`
  );
}

/**
 * Updates a rendered audio row in place: its time (`progress` only for the one playing; `duration` is the
 * file's length, known before playing) and its volume slider. Both views call it as the note audio
 * channel changes, instead of rendering the row again.
 */
export function syncAudioRow(
  row: HTMLElement,
  progress: { readonly currentTime: number; readonly duration: number } | undefined,
  duration: number | undefined,
  volume: number,
): void {
  const time = row.querySelector('.arc-embed-file-time');
  if (time) {
    const length = Number.isFinite(progress?.duration) ? progress!.duration : (duration ?? NaN);
    time.textContent = formatAudioTime(Boolean(progress), progress?.currentTime ?? 0, length);
  }

  const slider = row.querySelector<HTMLInputElement>('.arc-embed-file-volume');
  if (slider && document.activeElement !== slider) {
    slider.value = String(volume);
  }
  slider?.style.setProperty('--arc-volume', `${Math.round(volume * 100)}%`);
}

interface WikilinkTokenMeta {
  readonly isEmbed: boolean;
  /** Raw target as written between the brackets (`name#heading|label`). */
  readonly raw: string;
  readonly resolvedPath: string | null;
  readonly targetName: string;
  readonly heading: string | null;
  readonly label: string | null;
  /** Title of the resolved file: an encounter is shown by its name, not by `x.json`. */
  readonly resolvedTitle?: string | null;
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

/**
 * In-app route of an image, a sound or an encounter of a campaign or of a compendium system (its own page),
 * null for anything else.
 */
export function toInAppAssetRoute(resolvedPath: string): string | null {
  const location = parseVaultFilePath(resolvedPath);
  if (
    !location ||
    location.isNote ||
    !(IMAGE_EXTENSION_PATTERN.test(location.name) || AUDIO_EXTENSION_PATTERN.test(location.name))
  ) {
    return toInAppEncounterRoute(resolvedPath);
  }

  const folder = location.subfolder
    ? `${location.section}/${location.subfolder}`
    : location.section;
  return `${location.scopeRoute}/${folder}/${location.name}`;
}

/** Encounters are the `.json` files of the Encounters section (special files, not notes). */
export const ENCOUNTER_EXTENSION_PATTERN = /\.json$/i;
const ENCOUNTERS_SECTION_KEY = 'encounters';

/** In-app route of an encounter (a `.json` file of an Encounters section), null for anything else. */
export function toInAppEncounterRoute(resolvedPath: string): string | null {
  const location = parseVaultFilePath(resolvedPath);
  if (
    !location ||
    location.section !== ENCOUNTERS_SECTION_KEY ||
    !ENCOUNTER_EXTENSION_PATTERN.test(location.name)
  ) {
    return null;
  }

  const folder = location.subfolder
    ? `${location.section}/${location.subfolder}`
    : location.section;
  return `${location.scopeRoute}/${folder}/${location.name}`;
}

function renderWikilinkToken(token: Token): string {
  const { isEmbed, raw, resolvedPath, resolvedTitle, targetName, heading, label, sourcePath, mediaLabels } =
    token.meta as unknown as WikilinkTokenMeta;
  const displayText = escapeHtml(
    label ?? (heading ? `${targetName} > ${heading}` : targetName || 'this note'),
  );

  if (isEmbed && resolvedPath && IMAGE_EXTENSION_PATTERN.test(resolvedPath)) {
    const src = toAssetUrl(resolvedPath);
    return `<img class="arc-embed-image" src="${src}" alt="${displayText}" loading="lazy" data-path="${escapeHtml(resolvedPath)}" />`;
  }

  const mediaKind = isEmbed && resolvedPath ? getMediaEmbedKind(resolvedPath) : null;
  if (mediaKind && resolvedPath) {
    return renderMediaEmbedHtml(
      mediaKind,
      resolvedPath,
      label ?? (mediaKind === 'encounter' ? (resolvedTitle ?? targetName) : targetName),
      mediaLabels,
    );
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

  const route = toInAppNoteRoute(resolvedPath) ?? toInAppEncounterRoute(resolvedPath);
  if (route) {
    return `<a class="arc-wikilink" data-route="${escapeHtml(route)}" data-path="${escapeHtml(resolvedPath)}" href="#">${displayText}</a>`;
  }

  // Resolved (e.g. the vault-level compendium), but there's no browsing UI for it yet.
  return `<span class="arc-wikilink arc-wikilink-external" title="${escapeHtml(resolvedPath)}">${displayText}</span>`;
}

/**
 * Matches `[[...]]`/`![[...]]` and pairs it with its resolved link data from `env.links`, by its raw text
 * (not by position: adding or removing a link earlier in the note must not shift every link after it).
 */
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
    const link = env.links.find((item) => item.raw === match[2]);
    const token = state.push('wikilink', '', 0);
    const meta: WikilinkTokenMeta = {
      isEmbed: match[1] === '!',
      raw: link?.raw ?? match[2],
      resolvedPath: link?.resolvedPath ?? null,
      targetName: link?.targetName ?? match[2].split('|')[0].split('#')[0],
      heading: link?.heading ?? null,
      label: link?.raw.includes('|') ? link.raw.split('|').slice(1).join('|') : null,
      resolvedTitle: link?.resolvedTitle ?? null,
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

const TASK_MARKER_PATTERN = /^\[([ xX])\]\s+/;

/**
 * GitHub/Obsidian task lists: a list item starting with `[ ]` / `[x]` loses that text and gets a checkbox;
 * its list is marked so it has no bullets.
 */
function taskListRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let index = 2; index < tokens.length; index++) {
    const inlineToken = tokens[index];
    if (
      inlineToken.type !== 'inline' ||
      tokens[index - 1].type !== 'paragraph_open' ||
      tokens[index - 2].type !== 'list_item_open'
    ) {
      continue;
    }

    const match = TASK_MARKER_PATTERN.exec(inlineToken.content);
    if (!match) {
      continue;
    }

    inlineToken.content = inlineToken.content.slice(match[0].length);
    const isChecked = match[1] !== ' ';
    tokens[index - 2].attrJoin('class', isChecked ? 'arc-task-item arc-task-done' : 'arc-task-item');
    tokens[index - 2].meta = { taskChecked: isChecked };
    for (let listIndex = index - 3; listIndex >= 0; listIndex--) {
      const token = tokens[listIndex];
      if (
        (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') &&
        token.level === tokens[index - 2].level - 1
      ) {
        token.attrJoin('class', 'arc-task-list');
        break;
      }
    }
  }
}

function createRenderer(): MarkdownItInstance {
  // `breaks`: a line break in the note stays one in Reading, as in Live preview (and Obsidian).
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.renderer.rules['wikilink'] = (tokens, index) => renderWikilinkToken(tokens[index]);

  md.core.ruler.after('block', 'callout', calloutRule);
  md.core.ruler.after('block', 'task-list', taskListRule);
  // The checkbox goes inside the item's paragraph: in a loose list that paragraph is a block, and a box
  // placed before it would leave the text on the row below. (A tight list's paragraph is hidden.)
  const defaultListItemOpen = md.renderer.rules['list_item_open'] ?? renderTokenAsIs;
  const defaultParagraphOpen = md.renderer.rules['paragraph_open'] ?? renderTokenAsIs;
  md.renderer.rules['list_item_open'] = (tokens, index, options, env, self) => {
    const meta = tokens[index].meta as { taskChecked?: boolean } | null;
    const open = defaultListItemOpen(tokens, index, options, env, self);
    const paragraph = tokens[index + 1];
    // Tight: no <p>, so the box follows the <li>. Loose: the box goes inside the visible <p>.
    return meta?.taskChecked === undefined || paragraph?.hidden === false
      ? open
      : open + renderTaskBoxHtml(meta.taskChecked);
  };
  md.renderer.rules['paragraph_open'] = (tokens, index, options, env, self) => {
    const open = defaultParagraphOpen(tokens, index, options, env, self);
    const item = tokens[index - 1];
    const meta = item?.type === 'list_item_open' ? (item.meta as { taskChecked?: boolean } | null) : null;
    return meta?.taskChecked === undefined || tokens[index].hidden
      ? open
      : open + renderTaskBoxHtml(meta.taskChecked);
  };
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
