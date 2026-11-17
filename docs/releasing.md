# LazyDM — Releasing

Releases are made by hand on GitHub. The app never downloads or installs anything: on startup (and from
*Settings → About*) it asks GitHub for the latest release, compares the version, and opens the release page if there is
a newer one. The rules behind this are in `design-principles.md` §7 (*Update check*).

## What the app needs from a release

| Rule | Why |
| --- | --- |
| Tag is `vX.Y.Z` and equals `package.json` `version` (`v0.1.0` for `0.1.0`) | The app compares the tag, without the `v`, to its own version with semver. A tag that is not a version counts as a failed check. |
| The release is **published**, not a draft | `/releases/latest` does not see drafts. |
| The release is **not marked pre-release** | `/releases/latest` skips pre-releases, so betas are never offered. |
| The repository stays `Tratt0re/lazydm` | The update check and the allowlist of release pages both derive from `package.json` `repository.url`. |

Until the first release exists, *Settings → About* shows "No release has been published yet".

## Steps

1. **Start from `develop`, clean and green.**
   ```bash
   git switch develop && git status          # nothing uncommitted
   npm test && npm run test:electron
   npx ng build --configuration development
   ```
2. **Bump the version** in `package.json` and `package-lock.json` together
   (`npm version 0.2.0 --no-git-tag-version`), and commit it as `Release 0.2.0`.
3. **Merge into `main`** (only `develop` is merged there, never commit straight to `main`) and tag the merge commit:
   ```bash
   git switch main && git merge --no-ff develop
   git tag v0.2.0
   ```
4. **Build the release files.** One command builds every target and keeps one file per target in `release/all/`
   (the Mac targets need a Mac; the others build anywhere):
   ```bash
   npm run dist:all                 # everything
   npm run dist:all -- win-x64      # or only some: mac-arm64, mac-x64, win-x64, linux-x64
   ```
   | File | Target |
   | --- | --- |
   | `LazyDM-<version>-arm64-mac.zip` | macOS, Apple Silicon |
   | `LazyDM-<version>-mac.zip` | macOS, Intel |
   | `lazydm-setup-<version>-x64.exe` | Windows installer |
   | `lazydm-portable-<version>-x64.exe` | Windows, portable (no install) |
   | `lazydm-<version>.zip` | Linux |

   Open each build once before uploading it. The builds are not code-signed, so macOS and Windows warn on first
   launch; say so in the release notes.
5. **Push**, only when you decide to: `git push origin main develop --tags`.
6. **Create the release on GitHub** (*Releases → Draft a new release*): choose the tag `v0.2.0`, write the notes, attach
   the files from `release/`, leave *Set as a pre-release* off, and click **Publish release** (not *Save draft*).
7. **Check it.** In an installed older build, *Settings → About → Check for updates* shows the new version and
   *View release*. Then merge `main` back into `develop` so the version bump is on both branches.

## Notes

- The check is cached for 6 hours between startups; the *Check for updates* button always asks GitHub again.
- GitHub allows 60 unauthenticated API calls per hour per IP, so several people on one network can see "Couldn't check
  for updates" for a while. It clears by itself.
- A user can choose *Don't remind me about X.Y.Z*: that version no longer opens the pop-up, but the sidebar label and
  the About page still show it.
- To take a bad release back, delete it (or mark it pre-release) on GitHub: `/releases/latest` then falls back to the
  previous published release.
