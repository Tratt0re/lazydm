import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

const meta = new Map();
const appMetaModel = {
  getByKey: (key) => (meta.has(key) ? { key, value: meta.get(key) } : null),
  create: ({ key, value }) => meta.set(key, value),
  updateByKey: (key, { value }) => meta.set(key, value),
};

/** Puts a stand-in module in Node's cache so the controller's `require` gets it. */
function stub(id, exports) {
  const resolved = require.resolve(id);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

stub('electron', { app: { getVersion: () => '0.1.0' }, shell: { openExternal: vi.fn() } });
stub('../models', { appMetaModel });

const controller = require('../controllers/update.controller.js');

const RELEASE_URL = 'https://github.com/Tratt0re/lazydm/releases/tag/v0.2.0';

function answer(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  meta.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('update controller: forceCheck', () => {
  it('reports a newer release as available, with its page', async () => {
    fetch.mockResolvedValue(answer(200, { tag_name: 'v0.2.0', html_url: RELEASE_URL }));
    const result = await controller.forceCheck();
    expect(result).toMatchObject({
      status: 'available',
      updateAvailable: true,
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      releaseUrl: RELEASE_URL,
    });
  });

  it('reports the same version as up to date', async () => {
    fetch.mockResolvedValue(answer(200, { tag_name: 'v0.1.0', html_url: RELEASE_URL }));
    expect(await controller.forceCheck()).toMatchObject({ status: 'up-to-date', updateAvailable: false });
  });

  it('reports an older release as up to date', async () => {
    fetch.mockResolvedValue(answer(200, { tag_name: '0.0.9', html_url: RELEASE_URL }));
    expect((await controller.forceCheck()).status).toBe('up-to-date');
  });

  it('tells "no release yet" (404) from a failure', async () => {
    fetch.mockResolvedValue(answer(404));
    expect((await controller.forceCheck()).status).toBe('no-release');
  });

  it('reports a rate limit as an error', async () => {
    fetch.mockResolvedValue(answer(403));
    expect((await controller.forceCheck()).status).toBe('error');
  });

  it('reports a network failure or timeout as an error', async () => {
    fetch.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect((await controller.forceCheck()).status).toBe('error');
  });

  it('reports a tag that is not a version as an error', async () => {
    fetch.mockResolvedValue(answer(200, { tag_name: 'nightly', html_url: RELEASE_URL }));
    expect((await controller.forceCheck()).status).toBe('error');
  });

  it('does not hand out a release page outside the repository', async () => {
    fetch.mockResolvedValue(answer(200, { tag_name: 'v0.2.0', html_url: 'https://evil.example/x' }));
    const result = await controller.forceCheck();
    expect(result.status).toBe('available');
    expect(result.releaseUrl).toBeNull();
  });

  it('marks a version the user chose to ignore', async () => {
    meta.set('ignoredUpdateVersion', '0.2.0');
    fetch.mockResolvedValue(answer(200, { tag_name: 'v0.2.0', html_url: RELEASE_URL }));
    expect((await controller.forceCheck()).popupDismissedForThisVersion).toBe(true);
  });

  it('asks GitHub with a timeout and a generic user agent', async () => {
    fetch.mockResolvedValue(answer(404));
    await controller.forceCheck();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/Tratt0re/lazydm/releases/latest');
    expect(options.headers['User-Agent']).toBe('lazydm-app');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('update controller: check (startup)', () => {
  it('reuses the last answer instead of asking GitHub again', async () => {
    fetch.mockResolvedValue(answer(200, { tag_name: 'v0.2.0', html_url: RELEASE_URL }));
    await controller.forceCheck();
    fetch.mockClear();
    const result = await controller.check();
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'available', latestVersion: '0.2.0' });
  });
});

describe('update controller: isTrustedReleaseUrl', () => {
  it.each([
    [RELEASE_URL, true],
    ['https://github.com/Tratt0re/lazydm/releases', true],
    ['http://github.com/Tratt0re/lazydm/releases', false],
    ['https://github.com/Tratt0re/other/releases', false],
    ['https://github.com.evil.example/Tratt0re/lazydm/', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(controller.isTrustedReleaseUrl(url)).toBe(expected);
  });
});
