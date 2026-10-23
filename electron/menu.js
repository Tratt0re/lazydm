/** Actions the renderer performs when a menu entry is chosen (`menu:action` push event). */
const MENU_ACTION_EVENT = 'menu:action';

/** Entry ids the main process handles itself instead of sending them to the renderer. */
const MAIN_ACTIONS = Object.freeze({ revealVault: 'revealVault' });

/**
 * The macOS application menu. `labels` are the translated texts (keyed by entry id) and `enabled` says which
 * entries can be used right now (a vault open, a campaign shown…); both come from the renderer, which owns the
 * translations and knows the state. Standard editing, window and zoom entries use Electron roles.
 */
function buildMenuTemplate({ appName, labels = {}, enabled = {}, perform }) {
  const label = (id, fallback) => labels[id] ?? fallback;
  const item = (id, fallback, accelerator) => ({
    label: label(id, fallback),
    accelerator,
    enabled: enabled[id] === true,
    click: () => perform(id),
  });

  return [
    {
      label: appName,
      submenu: [
        { role: 'about', label: label('about', `About ${appName}`) },
        { type: 'separator' },
        item('settings', 'Settings…', 'Cmd+,'),
        { type: 'separator' },
        { role: 'services', label: label('services', 'Services') },
        { type: 'separator' },
        { role: 'hide', label: label('hide', `Hide ${appName}`) },
        { role: 'hideOthers', label: label('hideOthers', 'Hide Others') },
        { role: 'unhide', label: label('unhide', 'Show All') },
        { type: 'separator' },
        { role: 'quit', label: label('quit', `Quit ${appName}`) },
      ],
    },
    {
      label: label('file', 'File'),
      submenu: [
        item('newTab', 'New Tab', 'Cmd+T'),
        item('closeTab', 'Close Tab', 'Cmd+W'),
        { type: 'separator' },
        item('save', 'Save', 'Cmd+S'),
        { type: 'separator' },
        item('revealVault', 'Show the Vault in Finder'),
        { type: 'separator' },
        { role: 'close', label: label('closeWindow', 'Close Window'), accelerator: 'Cmd+Shift+W' },
      ],
    },
    {
      label: label('edit', 'Edit'),
      submenu: [
        { role: 'undo', label: label('undo', 'Undo') },
        { role: 'redo', label: label('redo', 'Redo') },
        { type: 'separator' },
        { role: 'cut', label: label('cut', 'Cut') },
        { role: 'copy', label: label('copy', 'Copy') },
        { role: 'paste', label: label('paste', 'Paste') },
        { role: 'selectAll', label: label('selectAll', 'Select All') },
        { type: 'separator' },
        item('search', 'Search the Campaign…', 'Cmd+K'),
      ],
    },
    {
      label: label('view', 'View'),
      submenu: [
        item('toggleSidebar', 'Toggle the Sidebar'),
        { type: 'separator' },
        item('compendium', 'Compendium'),
        item('templates', 'Templates'),
        item('battleRules', 'Battle Rules'),
        { type: 'separator' },
        { role: 'resetZoom', label: label('resetZoom', 'Actual Size') },
        { role: 'zoomIn', label: label('zoomIn', 'Zoom In') },
        { role: 'zoomOut', label: label('zoomOut', 'Zoom Out') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: label('fullscreen', 'Enter Full Screen') },
      ],
    },
    {
      label: label('go', 'Go'),
      submenu: [
        item('back', 'Back', 'Cmd+['),
        item('forward', 'Forward', 'Cmd+]'),
        { type: 'separator' },
        item('nextTab', 'Next Tab', 'Cmd+Alt+Right'),
        item('previousTab', 'Previous Tab', 'Cmd+Alt+Left'),
      ],
    },
    {
      label: label('window', 'Window'),
      role: 'windowMenu',
    },
    {
      label: label('help', 'Help'),
      role: 'help',
      submenu: [item('shortcuts', 'Keyboard Shortcuts', 'Cmd+/')],
    },
  ];
}

module.exports = {
  MAIN_ACTIONS,
  MENU_ACTION_EVENT,
  buildMenuTemplate,
};
