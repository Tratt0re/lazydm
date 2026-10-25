/**
 * A note link or an image to preview: the element (the card is placed by it), its vault path and, for a
 * note, its in-app route (an image has none here).
 */
export interface LinkPreviewRequest {
  readonly kind: 'note' | 'image' | 'file';
  readonly anchor: Element;
  readonly path: string;
  readonly route: string;
}

/** Resolved note links of both views carry their path and route; embedded images carry their path. */
const PREVIEWABLE_LINK_SELECTOR = '[data-route][data-path], img[data-path]';
/** Maps and encounters (`.json` files) have no body to preview: their button opens them in a new tab. */
const SPECIAL_FILE_PATTERN = /\.json$/i;
/** Gap between the eye button and the corner of an image. */
const IMAGE_CORNER_GAP = 6;
const BUTTON_SIZE = 22;
const HIDE_DELAY_MS = 250;
/** Lucide `eye`, inline: the button lives outside Angular templates. */
const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';

/** Lucide `ellipsis`, inline: the frame button under the eye of an image embed. */
const ELLIPSIS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';

/** The "…" button of an image embed was pressed: the image and the button's corner, to open the frame menu. */
export interface ImageFrameMenuRequest {
  readonly anchor: HTMLImageElement;
  readonly x: number;
  readonly y: number;
}

/** Gap between the eye button and the "…" button under it. */
const FRAME_BUTTON_GAP = 4;

/** Lucide `arrow-up-right`, inline: the button of a map or an encounter link. */
const OPEN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

/**
 * The eye button of note links and images: hovering (or focusing) a resolved note link inside `host` shows a
 * small button right after it, hovering an embedded image shows it in the image's top-right corner;
 * pressing it asks for the preview card. A map or encounter link has no card: its button (arrow) opens it in a
 * new tab. Returns the cleanup.
 */
export function attachLinkPreviewHover(
  host: HTMLElement,
  label: () => string,
  onPreview: (request: LinkPreviewRequest) => void,
  imageLabel: () => string = label,
  openLabel: () => string = label,
  /** Live preview only: images that carry `data-frame-embed` get a "…" button under the eye. */
  frameMenu?: {
    readonly label: () => string;
    /** False in a read-only editor: no button. */
    readonly enabled: () => boolean;
    readonly onOpen: (request: ImageFrameMenuRequest) => void;
  },
): () => void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'arc-link-preview-eye';
  button.dataset['linkPreview'] = '';
  button.innerHTML = EYE_ICON;
  button.hidden = true;
  // A host inside a sheet or a modal lives in the browser's top layer (the CDK overlay container is a popover):
  // only something inside that same layer paints above it, so the button goes in the host's own top-layer root.
  const buttonRoot = host.closest<HTMLElement>('[popover]') ?? document.body;
  buttonRoot.append(button);

  const frameButton = document.createElement('button');
  frameButton.type = 'button';
  frameButton.className = 'arc-link-preview-eye';
  frameButton.dataset['imageFrame'] = '';
  frameButton.innerHTML = ELLIPSIS_ICON;
  frameButton.hidden = true;
  if (frameMenu) {
    buttonRoot.append(frameButton);
  }

  let current: HTMLElement | null = null;
  let hideTimer = 0;

  const show = (link: HTMLElement) => {
    window.clearTimeout(hideTimer);
    const isImage = link instanceof HTMLImageElement;
    const isFile = !isImage && SPECIAL_FILE_PATTERN.test(link.dataset['path'] ?? '');
    button.innerHTML = isFile ? OPEN_ICON : EYE_ICON;
    // The last line box of the link: a link wrapping onto two lines gets the button after its end.
    const rects = link.getClientRects();
    const rect = rects[rects.length - 1] ?? link.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }
    if (isImage) {
      // Inside the top-right corner, kept within the visible part of the scrolling host.
      const hostRect = host.getBoundingClientRect();
      const top = Math.max(rect.top, hostRect.top);
      const right = Math.min(rect.right, hostRect.right);
      button.style.left = `${right - IMAGE_CORNER_GAP - BUTTON_SIZE}px`;
      button.style.top = `${top + IMAGE_CORNER_GAP + BUTTON_SIZE / 2}px`;
      frameButton.style.left = button.style.left;
      frameButton.style.top = `${top + IMAGE_CORNER_GAP + BUTTON_SIZE * 1.5 + FRAME_BUTTON_GAP}px`;
    } else {
      button.style.left = `${rect.right + 4}px`;
      button.style.top = `${rect.top + rect.height / 2}px`;
    }
    current = link;
    const text = isImage ? imageLabel() : isFile ? openLabel() : label();
    button.setAttribute(
      'aria-label',
      `${text}: ${isImage ? (link.getAttribute('alt') ?? '') : (link.textContent ?? '')}`,
    );
    button.title = text;
    button.hidden = false;
    if (frameMenu?.enabled() && isImage && 'frameEmbed' in link.dataset) {
      const frameText = frameMenu.label();
      frameButton.setAttribute('aria-label', frameText);
      frameButton.title = frameText;
      frameButton.hidden = false;
    } else {
      frameButton.hidden = true;
    }
  };
  const hide = () => {
    window.clearTimeout(hideTimer);
    button.hidden = true;
    frameButton.hidden = true;
    current = null;
  };
  const scheduleHide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, HIDE_DELAY_MS);
  };
  const findLink = (target: EventTarget | null) =>
    (target as Element | null)?.closest?.<HTMLElement>(PREVIEWABLE_LINK_SELECTOR) ?? null;

  const onOver = (event: Event) => {
    const link = findLink(event.target);
    if (link && host.contains(link)) {
      show(link);
    }
  };
  const onOut = (event: Event) => {
    const next = (event as MouseEvent).relatedTarget as Node | null;
    if (findLink(event.target) && !button.contains(next) && !frameButton.contains(next)) {
      scheduleHide();
    }
  };
  const onFrameClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const image = current;
    if (frameMenu && image instanceof HTMLImageElement && image.isConnected) {
      const rect = frameButton.getBoundingClientRect();
      frameMenu.onOpen({ anchor: image, x: rect.left, y: rect.bottom + 2 });
    }
  };
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const link = current;
    if (link?.isConnected) {
      const path = link.dataset['path'] ?? '';
      onPreview({
        kind:
          link instanceof HTMLImageElement
            ? 'image'
            : SPECIAL_FILE_PATTERN.test(path)
              ? 'file'
              : 'note',
        anchor: link,
        path,
        route: link.dataset['route'] ?? '',
      });
    }
  };

  host.addEventListener('mouseover', onOver);
  host.addEventListener('mouseout', onOut);
  host.addEventListener('focusin', onOver);
  host.addEventListener('focusout', onOut);
  // Scrolling moves the link away from the button.
  host.addEventListener('scroll', hide, true);
  button.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  button.addEventListener('mouseleave', scheduleHide);
  button.addEventListener('blur', scheduleHide);
  button.addEventListener('click', onClick);
  frameButton.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  frameButton.addEventListener('mouseleave', scheduleHide);
  frameButton.addEventListener('blur', scheduleHide);
  frameButton.addEventListener('click', onFrameClick);

  return () => {
    window.clearTimeout(hideTimer);
    host.removeEventListener('mouseover', onOver);
    host.removeEventListener('mouseout', onOut);
    host.removeEventListener('focusin', onOver);
    host.removeEventListener('focusout', onOut);
    host.removeEventListener('scroll', hide, true);
    button.remove();
    frameButton.remove();
  };
}
