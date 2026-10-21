const { shell } = require('electron');

/** Schemes a note link may hand over to the operating system. */
const EXTERNAL_PROTOCOLS = Object.freeze(new Set(['https:', 'http:', 'mailto:']));

/** The parsed URL when it uses an allowed scheme, otherwise null. */
function parseExternalUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Opens `value` in the system browser/mail app, only when it is an http(s) or mailto link. */
async function openExternalSafe(value) {
  const url = parseExternalUrl(value);
  if (!url) {
    console.warn('[electron] Blocked external URL with a disallowed scheme');
    return false;
  }

  await shell.openExternal(url.href);
  return true;
}

module.exports = { EXTERNAL_PROTOCOLS, openExternalSafe, parseExternalUrl };
