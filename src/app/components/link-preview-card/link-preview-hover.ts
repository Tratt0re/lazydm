/** A note link to preview: the link element (the card is placed by it), its vault path and in-app route. */
export interface LinkPreviewRequest {
  readonly anchor: Element;
  readonly path: string;
  readonly route: string;
}

/** Resolved note links of both views carry their path and route. */
const PREVIEWABLE_LINK_SELECTOR = '[data-route][data-path]';
const HIDE_DELAY_MS = 250;
/** Lucide `eye`, inline: the button lives outside Angular templates. */
const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';

/**
 * The eye button of note links: hovering (or focusing) a resolved note link inside `host` shows a small
 * button right after it; pressing it asks for the link's preview card. Returns the cleanup.
 */
export function attachLinkPreviewHover(
  host: HTMLElement,
  label: () => string,
  onPreview: (request: LinkPreviewRequest) => void,
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
    // The last line box of the link: a link wrapping onto two lines gets the button after its end.
    const rects = link.getClientRects();
    const rect = rects[rects.length - 1] ?? link.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }
    button.style.left = `${rect.right + 4}px`;
    button.style.top = `${rect.top + rect.height / 2}px`;
    current = link;
    button.setAttribute('aria-label', `${label()}: ${link.textContent ?? ''}`);
    button.title = label();
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
