const COMPENDIUM_DIR_NAME = 'compendium';

/**
 * A vault path as the user reads it in a list: without the campaign folder (inside one campaign it is noise), so
 * `lost-mine/scene/capitolo-1/goblin.md` shows as `scene/capitolo-1/goblin.md`. A compendium file keeps
 * `compendium/<system>/`, which tells it apart from a campaign's.
 */
export function toDisplayPath(vaultPath: string): string {
  const segments = vaultPath.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] === COMPENDIUM_DIR_NAME) {
    return segments.join('/');
  }

  return segments.slice(1).join('/');
}
