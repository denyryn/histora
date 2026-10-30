# Histora

Histora removes chosen pages from your browsing history. Add a rule for a site, a host, a path, or a word in the URL, and everything matching it is removed from your history as soon as you visit it — the promise is exactly "Removed from history", and nothing more. It cannot stop the visit being recorded for a moment before the rule fires, and it cannot touch recently closed tabs, downloads, or history on your other devices. Nothing leaves your browser: no telemetry, no network requests, no remote code.

## Install

**Chrome, Chromium, Edge** — download `histora-<version>-chrome.zip` from the release artifacts, unzip it, open `chrome://extensions`, turn on Developer mode, and pick **Load unpacked** (in Edge: `edge://extensions`). The unzipped folder must stay where it is — the browser loads the extension from it.

**Firefox** — download `histora-<version>-firefox.xpi` from GitHub Releases. Firefox only keeps an unsigned XPI on Firefox Developer Edition, Nightly, or ESR with `xpinstall.signatures.required` set to `false` in `about:config`; a release- or beta-channel Firefox will accept it only after AMO signing. No signed XPI ships from this repo yet — the AMO path is still unexercised. Developer Edition users: open `about:debugging` → **This Firefox** → **Load Temporary Add-on** is an alternative, but it does not survive a restart.

## How it works

- **Rules are strict and exact.** No wildcards, no regex, no host folding. `example.com` does not match `www.example.com`; `porn` does not match `pornography`.
- **Deletion happens after the visit.** A matched visit is deleted on the spot, and a background sweep every 6 hours re-checks recent history for anything a rule now covers (for example, a rule armed after the pages were visited).
- **The audit log is the evidence.** Every removal is recorded locally — the URL, the time, and the rule that deleted it — readable from the options page.

## Rule kinds

| Kind | Matches |
|---|---|
| keyword | A whole word token in the URL — a host label, path segment, or query key/value; case-insensitive. |
| domain | Exactly one registrable domain (`example.com`), nothing under the host (`www.`, `m.`) — the form offers those as one-tap additions. |
| subdomain | Exactly one host (`www.example.com`), any depth. |
| slug (path) | One exact path (ignoring query and fragment) on **every** site it appears on — host-agnostic by design, which is why path rules can be created only in the options page, behind a warning. |

## Version and checksums

| Artifact | Version | SHA-256 |
|---|---|---|
| `histora-0.1.0-chrome.zip` | 0.1.0 | *printed by `npm run release`* |
| `histora-0.1.0-firefox.xpi` | 0.1.0 | *printed by `npm run release`* |

After running `npm run release`, the hashes for the artifacts you built live in `dist/release/SHA256SUMS` and are printed alongside the artifact paths; the build embeds timestamps, so only the checksums against the files you actually downloaded are meaningful.

## Passcode lock

Settings can require a passcode before the options page opens. Set it under **Settings → Passcode**: 4 to 12 digits, stored only as a PBKDF2-SHA256 hash.

Setting a passcode shows a backup code once — copy it or download `histora-backup-code.txt` and keep it somewhere else. If you forget the passcode, choose **Use a backup code instead** on the lock screen; a correct code turns the passcode off so you can set a new one. Five wrong attempts pause entry for 30 seconds.

This is a lock on the settings page, not encryption. Your rules and audit log stay readable in the extension's storage, and anyone who clears the extension's data removes the passcode with it.

## Releases

CI runs `npm ci`, the type check, the tests, and a full two-target build on every push to `main` and every pull request (`.github/workflows/ci.yml`).

Releases are tag-driven (`.github/workflows/release.yml`). A tag that disagrees with `package.json` fails the workflow before anything is built; otherwise it builds both targets, verifies `SHA256SUMS`, uploads the artifacts, and publishes the GitHub Release with the zip, the xpi, and the checksum file attached.

```sh
npm version patch                       # bumps package.json
# set the same version in src/manifest.json — the release script fails on drift
git commit -am "v0.1.1"
git tag -a v0.1.1 -m "Histora 0.1.1"
git push && git push origin v0.1.1
```

Running the Release workflow by hand (`workflow_dispatch`) does the same build and uploads the artifacts without publishing a release.

## Development

```sh
npm run dev          # extension dev server
npm run test         # vitest
npm run typecheck    # tsc --noEmit
npm run build:chrome # production build → dist/chrome
npm run build:firefox# production build → dist/firefox
npm run release      # build both, package zip + xpi, write SHA256SUMS
```

Built and tested with Node 26.8.1 and npm 11.19.0. The zip needs the `zip` CLI on PATH; without it the release script falls back to a built-in writer.
