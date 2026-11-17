const { app } = require('electron');
const semver = require('semver');
const { appMetaModel } = require('../models');
const { openExternalSafe } = require('../utils/external-url');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 8000;

/** Release page found by the last check: the only URL `openRelease` will open. */
let lastReleaseUrl = null;

function getOwnerRepo() {
  try {
    const pkg = require('../../package.json');
    const url = pkg.repository?.url ?? '';
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    // The placeholder from `npm init` is not a real repository: nothing to check (see docs/design-principles.md §12).
    if (match && match[1].toLowerCase() !== 'yourusername') return { owner: match[1], repo: match[2] };
  } catch (_) {}
  return null;
}

/** Whether `value` is an https page of the configured GitHub repository. */
function isTrustedReleaseUrl(value) {
  const ownerRepo = getOwnerRepo();
  if (!ownerRepo || typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.toLowerCase().startsWith(`/${ownerRepo.owner}/${ownerRepo.repo}/`.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** `available` | `up-to-date` | `no-release` (nothing published yet) | `error` (offline, rate limit, bad answer). */
const STATUS = Object.freeze({
  available: 'available',
  upToDate: 'up-to-date',
  noRelease: 'no-release',
  error: 'error',
});

/** Result of the last successful look, reused for CHECK_INTERVAL_MS by the startup check. */
let cache = null;

/** The latest published release; throws on network errors, null when the repository has no release yet. */
async function fetchLatestRelease() {
  const ownerRepo = getOwnerRepo();
  if (!ownerRepo) return null;

  const { owner, repo } = ownerRepo;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'lazydm-app', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

  const data = await response.json();
  return { tagName: data.tag_name ?? null, htmlUrl: data.html_url ?? null };
}

function buildResult({ status, currentVersion, latestVersion = null, releaseUrl = null }) {
  const ignoredVersion = appMetaModel.getByKey('ignoredUpdateVersion')?.value ?? null;
  return {
    status,
    updateAvailable: status === STATUS.available,
    currentVersion,
    latestVersion,
    releaseUrl,
    popupDismissedForThisVersion: latestVersion !== null && ignoredVersion === latestVersion,
  };
}

async function performCheck(currentVersion) {
  const release = await fetchLatestRelease();
  if (!release) return buildResult({ status: STATUS.noRelease, currentVersion });

  const latestVersion = semver.valid(String(release.tagName ?? '').replace(/^v/, ''));
  if (!latestVersion) return buildResult({ status: STATUS.error, currentVersion });

  lastReleaseUrl = isTrustedReleaseUrl(release.htmlUrl) ? release.htmlUrl : null;
  const updateAvailable = semver.gt(latestVersion, currentVersion);

  return buildResult({
    status: updateAvailable ? STATUS.available : STATUS.upToDate,
    currentVersion,
    latestVersion,
    releaseUrl: lastReleaseUrl,
  });
}

async function runCheck() {
  const currentVersion = app.getVersion();
  try {
    const result = await performCheck(currentVersion);
    cache = { at: Date.now(), result };
    return result;
  } catch (error) {
    console.warn('[electron] Update check failed:', error?.message ?? error);
    return buildResult({ status: STATUS.error, currentVersion });
  }
}

/** Startup check: reuses the last answer for a few hours so restarts do not hit GitHub's rate limit. */
async function check() {
  if (cache && Date.now() - cache.at < CHECK_INTERVAL_MS) {
    return buildResult({
      status: cache.result.status,
      currentVersion: cache.result.currentVersion,
      latestVersion: cache.result.latestVersion,
      releaseUrl: cache.result.releaseUrl,
    });
  }
  return runCheck();
}

/** The button in Settings → About: always asks GitHub. */
async function forceCheck() {
  return runCheck();
}

/** The version of the running app, for the About page. */
function getVersion() {
  return app.getVersion();
}

/** Opens the release page of the last check; the renderer's payload is ignored on purpose. */
async function openRelease() {
  if (lastReleaseUrl) await openExternalSafe(lastReleaseUrl);
}

function ignoreVersion(payload) {
  const version = payload?.version;
  if (!version) return;

  const existing = appMetaModel.getByKey('ignoredUpdateVersion');
  if (!existing) {
    appMetaModel.create({ key: 'ignoredUpdateVersion', value: version });
  } else {
    appMetaModel.updateByKey('ignoredUpdateVersion', { value: version });
  }
}

module.exports = {
  STATUS,
  isTrustedReleaseUrl,
  check,
  forceCheck,
  getVersion,
  openRelease,
  ignoreVersion,
};
