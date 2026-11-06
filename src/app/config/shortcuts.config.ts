/** Where a shortcut works: it groups the shortcuts in the overlay. */
export type ShortcutScope = 'global' | 'tabs' | 'editor' | 'map';

/** `mod` is Cmd on macOS and Ctrl elsewhere; `alt` is Option on macOS. */
export interface ShortcutKeys {
  readonly mod?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
  /** A key as `KeyboardEvent.key` names it, lower case (`k`, `arrowright`, `[`, `delete`). */
  readonly key: string;
}

export interface ShortcutDefinition {
  /** Translated through `shortcuts.items.<id>`. */
  readonly id: string;
  readonly scope: ShortcutScope;
  /** Alternatives, any of which does it (`Delete` and `Backspace`). Empty for mouse gestures. */
  readonly combos: readonly ShortcutKeys[];
  /** Mouse gestures have no keys: their text is the whole description. */
  readonly gesture?: boolean;
}

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ['global', 'tabs', 'editor', 'map'];

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: 'search', scope: 'global', combos: [{ mod: true, key: 'k' }] },
  { id: 'shortcuts', scope: 'global', combos: [{ mod: true, key: '/' }] },
  { id: 'closeSheet', scope: 'global', combos: [{ key: 'escape' }] },

  { id: 'newTab', scope: 'tabs', combos: [{ mod: true, key: 't' }] },
  { id: 'closeTab', scope: 'tabs', combos: [{ mod: true, key: 'w' }] },
  { id: 'back', scope: 'tabs', combos: [{ mod: true, key: '[' }] },
  { id: 'forward', scope: 'tabs', combos: [{ mod: true, key: ']' }] },
  { id: 'nextTab', scope: 'tabs', combos: [{ mod: true, alt: true, key: 'arrowright' }] },
  { id: 'previousTab', scope: 'tabs', combos: [{ mod: true, alt: true, key: 'arrowleft' }] },
  { id: 'cycleTabs', scope: 'tabs', combos: [{ key: 'ctrl+tab' }] },

  { id: 'save', scope: 'editor', combos: [{ mod: true, key: 's' }] },
  { id: 'bold', scope: 'editor', combos: [{ mod: true, key: 'b' }] },
  { id: 'italic', scope: 'editor', combos: [{ mod: true, key: 'i' }] },
  { id: 'linkSuggestions', scope: 'editor', combos: [{ key: '[[' }] },
  { id: 'acceptSuggestion', scope: 'editor', combos: [{ key: 'tab' }, { key: 'enter' }] },
  { id: 'openLinkInTab', scope: 'editor', combos: [], gesture: true },
  { id: 'openLinkInSide', scope: 'editor', combos: [], gesture: true },

  { id: 'mapFinishPath', scope: 'map', combos: [{ key: 'enter' }] },
  { id: 'mapCancel', scope: 'map', combos: [{ key: 'escape' }] },
  { id: 'mapPan', scope: 'map', combos: [{ key: 'space' }] },
  { id: 'mapSelectAll', scope: 'map', combos: [{ mod: true, key: 'a' }] },
  { id: 'mapDelete', scope: 'map', combos: [{ key: 'delete' }, { key: 'backspace' }] },
  { id: 'mapAddToSelection', scope: 'map', combos: [], gesture: true },
];

import { TOOLTIP_SHORTCUT_SEPARATOR } from '@/shared/components/tooltip';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

const KEY_NAMES: Readonly<Record<string, string>> = {
  arrowright: '→',
  arrowleft: '←',
  arrowup: '↑',
  arrowdown: '↓',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  delete: 'Del',
  backspace: '⌫',
  'ctrl+tab': 'Ctrl Tab',
};

/** The key caps of a combination for this platform: `⌘ ⌥ →` on macOS, `Ctrl Alt →` elsewhere. */
export function keyCaps(combo: ShortcutKeys): readonly string[] {
  if (combo.key.startsWith('ctrl+')) {
    return ['Ctrl', KEY_NAMES[combo.key.slice(5)] ?? combo.key.slice(5)];
  }

  return [
    ...(combo.mod ? [isMac ? '⌘' : 'Ctrl'] : []),
    ...(combo.alt ? [isMac ? '⌥' : 'Alt'] : []),
    ...(combo.shift ? [isMac ? '⇧' : 'Shift'] : []),
    KEY_NAMES[combo.key] ?? combo.key.toUpperCase(),
  ];
}

/** One line for a tooltip: `⌘S`, `Ctrl+Alt+→`. */
export function shortcutText(id: string): string {
  const combo = SHORTCUTS.find((shortcut) => shortcut.id === id)?.combos[0];
  if (!combo) {
    return '';
  }

  return keyCaps(combo).join(isMac ? '' : '+');
}

/** A tooltip text with its shortcut after it (`Save`, then a smaller, dimmer `⌘S`). */
export function withShortcut(label: string, id: string | undefined): string {
  const text = id ? shortcutText(id) : '';
  return text ? `${label}${TOOLTIP_SHORTCUT_SEPARATOR}${text}` : label;
}

/** Whether a keyboard event is this combination (`mod` = Cmd on macOS, Ctrl elsewhere). */
export function matchesShortcut(event: KeyboardEvent, id: string): boolean {
  const shortcut = SHORTCUTS.find((item) => item.id === id);
  const key = event.key.toLowerCase();
  const hasMod = isMac ? event.metaKey : event.ctrlKey;
  return (
    shortcut?.combos.some(
      (combo) =>
        combo.key === (key === ' ' ? 'space' : key) &&
        !!combo.mod === hasMod &&
        !!combo.alt === event.altKey &&
        !!combo.shift === event.shiftKey,
    ) ?? false
  );
}
