/**
 * What a click on a link asks for: `side` (Cmd/Ctrl+Alt-click: a new tab on the other side of the split screen),
 * `tab` (Cmd/Ctrl-click: a new background tab) or `null` (a plain click).
 */
export type LinkOpenMode = 'side' | 'tab';

export function getLinkOpenMode(
  event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'altKey'>,
): LinkOpenMode | null {
  if (!event.metaKey && !event.ctrlKey) {
    return null;
  }

  return event.altKey ? 'side' : 'tab';
}
