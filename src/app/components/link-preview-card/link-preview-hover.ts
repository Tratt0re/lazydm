/**
 * A note link or an image to preview: the element (the card is placed by it), its vault path and, for a
 * note, its in-app route (an image has none here).
 */
export interface LinkPreviewRequest {
  readonly kind: 'note' | 'image';
  readonly anchor: Element;
  readonly path: string;
  readonly route: string;
}

/** Resolved note links of both views carry their path and route; embedded images carry their path. */
const PREVIEWABLE_LINK_SELECTOR = '[data-route][data-path], img[data-path]';
/** Gap between the eye button and the corner of an image. */
const IMAGE_CORNER_GAP = 6;
const BUTTON_SIZE = 22;
const HIDE_DELAY_MS = 250;
/** Lucide `eye`, inline: the button lives outside Angular templates. */
const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';

/**
 * The eye button of note links and images: hovering (or focusing) a resolved note link inside `host` shows a
 * small button right after it, hovering an embedded image shows it in the image's top-right corner;
 * pressing it asks for the preview card. Returns the cleanup.
 */
export function attachLinkPreviewHover(
  host: HTMLElement,
  label: () => string,
  onPreview: (request: LinkPreviewRequest) => void,
  imageLabel: () => string = label,
): () => void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'arc-link-preview-eye';
  button.dataset['linkPreview'] = '';
  button.innerHTML = EYE_ICON;
  button.hidden = true;
  document.body.append(button);

  let current: HTMLElement | null = null;
  let hideTimer = 0;

  const show = (link: HTMLElement) => {
    window.clearTimeout(hideTimer);
    const isImage = link instanceof HTMLImageElement;
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
    } else {
      button.style.left = `${rect.right + 4}px`;
      button.style.top = `${rect.top + rect.height / 2}px`;
    }
    current = link;
    const text = isImage ? imageLabel() : label();
    button.setAttribute(
      'aria-label',
      `${text}: ${isImage ? (link.getAttribute('alt') ?? '') : (link.textContent ?? '')}`,
    );
    button.title = text;
    button.hidden = false;
  };
  const hide = () => {
    window.clearTimeout(hideTimer);
    button.hidden = true;
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
    if (findLink(event.target) && !button.contains(next)) {
      scheduleHide();
    }
  };
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const link = current;
    if (link?.isConnected) {
      onPreview({
        kind: link instanceof HTMLImageElement ? 'image' : 'note',
        anchor: link,
        path: link.dataset['path'] ?? '',
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

  return () => {
    window.clearTimeout(hideTimer);
    host.removeEventListener('mouseover', onOver);
    host.removeEventListener('mouseout', onOut);
    host.removeEventListener('focusin', onOver);
    host.removeEventListener('focusout', onOut);
    host.removeEventListener('scroll', hide, true);
    button.remove();
  };
}
