# Histora

Histora removes chosen pages from your browsing history. Add a rule for a site, a host, a path, or a word in the URL. Matching visits are deleted as you browse, and a background sweep catches history that a new rule now covers.

The promise is narrow: **Removed from history**. Histora cannot stop a visit being recorded for a moment before the rule fires. It cannot clear recently closed tabs, downloads, or history on your other devices. Nothing leaves your browser: no telemetry, no network requests, no remote code.

## Contents

- [Install](#install)
- [Use Histora](#use-histora)
- [How rules match](#how-rules-match)
- [How removal works](#how-removal-works)
- [Privacy and stored data](#privacy-and-stored-data)
- [Limits and troubleshooting](#limits-and-troubleshooting)
- [Develop Histora](#develop-histora)
- [Release process](#release-process)
- [Documentation](#documentation)
- [License](#license)

## Install

Download the latest build from [GitHub Releases](https://github.com/denyryn/histora/releases). Histora ships builds for Chromium-based browsers and Firefox. There is no Safari build.

### Chrome, Chromium, Edge

1. Download `histora-<version>-chrome.zip`.
2. Unzip it somewhere permanent. The browser loads the extension from that folder.
3. Open `chrome://extensions` (or `edge://extensions`).
4. Turn on **Developer mode**.
5. Choose **Load unpacked** and select the unzipped folder.

Chrome warns about developer-mode extensions on startup. That warning is expected for an extension installed outside the Chrome Web Store.

### Firefox

Download `histora-<version>-firefox.xpi`.

Release-channel Firefox refuses unsigned XPIs. To install the file from this repository, use Firefox Developer Edition, Nightly, or ESR with `xpinstall.signatures.required` set to `false` in `about:config`.

For a temporary install that disappears on restart, open `about:debugging` → **This Firefox** → **Load Temporary Add-on** and select `manifest.json` from an unzipped build.

### Verify a download

Each release includes `SHA256SUMS`. From the folder containing the downloaded files:

```sh
sha256sum -c SHA256SUMS
```

Builds embed timestamps, so compare checksums against the files you downloaded, not against a build made on another machine.

## Use Histora

### Popup

Click the Histora toolbar icon. The popup has four parts.

**Quick add.** Type a domain or a word and press the `+` button, or press Enter. Histora chooses the rule type:

| Input | Rule created |
|---|---|
| `example.com` | Domain rule for `example.com` |
| `https://example.com/account` | Domain rule for `example.com`; the path is ignored |
| `www.example.com` | Exact-host rule for `www.example.com` |
| `127.0.0.1`, `[::1]` | Exact-host rule |
| `porn`, `receipt` | Keyword rule for that whole word |
| `co.uk` | Rejected, because it is a public suffix rather than a site |
| Two or more words | Rejected; add one keyword per word |

Path rules cannot be created from the popup. A path rule is host-agnostic, so Histora asks you to create it on the options page where the warning and preview are visible.

**Current site.** The popup reads the active tab and offers one-tap rules for the site domain and, when it differs, the exact host. It also shows whether a rule already exists.

**Pause removal.** The switch stops both live deletion and background sweeps. Browsing continues to be recorded while paused.

**Settings.** The gear opens the options page.

### Options page

The options page covers rules, adding rules, the audit log, and settings.

**Rules.** Every rule has a plain-language label, an enable switch, and a delete button. Export writes a JSON file containing the rules only. Import merges a Histora rules export into the current list: existing rules are kept, duplicates are skipped, invalid entries are counted, and the 200-rule cap is enforced.

**Add a rule.** Pick one of four rule kinds, enter a value, and review the live preview before saving. The preview shows how many history entries already match and the first few URLs. For domain rules it also lists other hosts on the same site, such as `www.` or `m.`, and offers them as one-tap rules. Path rules carry a warning because they apply on every site.

**Audit log.** Every removal attempt is recorded: the URL, the time, the rule that fired, and whether deletion succeeded. The log holds the newest 500 attempts and stays on this device. You can clear it.

**Settings.** Pause removal, choose how far back a sweep looks, and set an optional passcode for the options page.

## How rules match

Rules are exact. There are no wildcards, no regular expressions, and no host folding. `example.com` does not match `www.example.com`. `porn` does not match `pornography` or `pornhub`.

| Kind | Value | Matches |
|---|---|---|
| `keyword` | A word with at least two characters | A whole token in the URL: a host label, a path segment, or a query key or value. Case-insensitive. |
| `domain` | A registrable domain (`example.com`) | Exactly that host. Subdomains are not included. |
| `subdomain` | Any hostname (`www.example.com`) | Exactly that host, at any depth. |
| `slug` | A path (`/account/orders`) | Exactly that path on every site. Query and fragment are ignored. |

Normalization applies to both the rule and the URL:

- Scheme and host are lowercased; internationalized hosts are compared in punycode.
- Default ports and a trailing dot on the host are dropped.
- Fragments are dropped.
- Paths get a leading slash and lose a trailing slash, except the root path.
- Paths are compared in raw and percent-decoded form.
- Path case is preserved, because servers treat paths as case-sensitive.
- Only `http:` and `https:` URLs are matched. Browser pages, files, extension pages, and other schemes are ignored.

Strictness has three visible costs:

1. A rule for `example.com` leaves `www.example.com` alone. The options preview offers the sibling hosts it finds in your history.
2. A keyword matches whole tokens, so `porn` leaves `pornography` and `pornhub` alone.
3. A path rule deletes that path on every site. That is why it lives behind a warning in the options page.

## How removal works

### Live removal

When the browser reports a visit, Histora loads the enabled rules and checks the URL against them. The first matching rule wins. If the visit matches, Histora calls `history.deleteUrl` with the URL as reported. If the entry still exists, it retries with the normalized URL, which covers trailing-slash and host-case differences.

Every attempt is written to the audit log. If both delete attempts fail, the entry stays for the next sweep and the failure is recorded with the browser error.

Pause applies to this path too. While paused, Histora records nothing and deletes nothing.

### Background sweep

The sweep exists for history that was already there when a rule was added, and for visits the live listener missed while the extension or browser was not running.

It runs:

- when the extension is installed;
- about one minute after install, because the install-time first navigation is missed by both browsers;
- when the browser starts;
- every 6 hours through `chrome.alarms`.

Each run reads history in 7-day windows, newest first, and evaluates all enabled rules in memory. It does not run one search per rule. A run handles at most 5,000 entries. When it stops at that budget, it records a cursor and the next run resumes there.

The sweep window is configurable: 30, 90, or 365 days, or all history. The default is 90 days. A single-rule sweep after a rule is saved has a smaller budget of 2,000 entries. A lock with a 5-minute stale timeout prevents two runs from overlapping.

## Privacy and stored data

Histora has no server. It makes no network requests and loads no remote code.

| Data | Storage | Details |
|---|---|---|
| Rules | `storage.sync` | One compact item, capped at 200 rules and kept under 7,000 bytes. If browser sync is on, rules travel between your signed-in browsers. |
| Settings | `storage.local` | Pause state, sweep window, onboarding flag, sweep cursor, and lock timestamp. |
| Audit log | `storage.local` | Newest 500 removal attempts. Never synced. |
| Passcode | `storage.local` | PBKDF2-SHA256 hash with a random salt and 210,000 iterations. The passcode itself is not stored. |

Permissions requested:

| Permission | Why |
|---|---|
| `history` | Read and delete history entries. This is the product. |
| `storage` | Keep rules, settings, audit entries, and the optional passcode. |
| `alarms` | Run the periodic sweep. |
| `activeTab` | Read the current tab URL when you open the popup. |

There are no host permissions, no content scripts, no `tabs` permission, and no network access.

### Passcode lock

The passcode gates the options page. Set a 4-to-12-digit code under **Settings → Passcode**.

Setting a passcode shows a backup code once. Copy it or download `histora-backup-code.txt` and keep it somewhere outside this browser. A correct backup code turns the passcode off so you can set a new one. Five wrong attempts pause entry for 30 seconds.

This is a lock on the settings page, not encryption. Rules and the audit log remain readable in extension storage. Anyone who clears the extension's data also removes the passcode.

## Limits and troubleshooting

**A new rule did not remove older history.** The sweep looks back 90 days by default. Change **Settings → Sweep window** to **All history**, then wait for the next periodic sweep. A rule confirmation only scans a bounded number of recent entries.

**`example.com` did not remove `www.example.com`.** That is the strict domain rule. Add `www.example.com` as an exact-host rule, or use the sibling buttons in the options preview.

**`porn` did not remove `pornhub.com`.** Keywords match whole tokens. `pornhub` is a different token. Add `pornhub` as its own keyword, or add the domain.

**A path rule disappeared from the popup.** Path rules are options-only by design. Use **Add a rule → Path on every site**.

**Nothing is being removed.** Check the pause switch in the popup or settings. Check the audit log for `Failed` rows. Confirm the URL uses `http` or `https`; other schemes are ignored.

**The browser says the extension is in developer mode.** Expected for a build loaded outside the store. The warning appears at startup on Windows and macOS.

**Firefox will not install the XPI.** Release-channel Firefox requires a signature. Use Developer Edition, Nightly, or ESR with signatures disabled, or wait for the AMO-signed build.

**I forgot the passcode.** Use the backup code from setup. Without it, clearing the extension's data removes the passcode along with the rules and audit log.

**How do updates work?** They do not happen automatically. An extension installed outside a store cannot check for updates. Download the new release and reinstall it. The version appears in the popup, the options page, and the audit header.

## Develop Histora

### Requirements

- Node.js 24 or newer. CI uses Node 24; local builds have used Node 26.
- npm 11.
- The `zip` command is optional. `npm run release` falls back to a built-in writer when it is missing.

### Setup

```sh
git clone https://github.com/denyryn/histora.git
cd histora
npm ci
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the extension.js development server. |
| `npm start` | Start the extension in a browser profile managed by extension.js. |
| `npm run preview` | Preview the production build. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm run build` | Production build with the default browser target. |
| `npm run build:chrome` | Production build for Chrome into `dist/chrome`. |
| `npm run build:firefox` | Production build for Firefox into `dist/firefox`. |
| `npm run build:edge` | Production build for Edge. |
| `npm run release` | Build Chrome and Firefox, package both, and write `dist/release/SHA256SUMS`. |

The build scripts pass `--zip`, so a browser-specific build also writes a zip beside the unpacked output. Release packaging lives in `scripts/release.mjs`.

### Project layout

```
src/
  background.ts              listener registration and message handling
  core/
    normalize.ts             URL parsing, host and path normalization
    tokens.ts                keyword tokenization
    match.ts                 rule types and the matcher
    rules.ts                 validation, quick-add resolution, CRUD, dedupe, cap
    format.ts                human labels for rules
  history/
    api.ts                   browser API namespace and history helpers
    delete.ts                delete with normalized-URL fallback
    sweep.ts                 chunked reconciliation, cursor, lock
  storage/
    rules.ts                 storage.sync codec, byte budget, 200-rule cap
    settings.ts              storage.local settings
    audit.ts                 serialized 500-entry ring buffer
  rules/
    service.ts               rule operations used by both UIs
    site.ts                  active-tab context for the popup
    import.ts                rules-file merge
    export.ts                rules-file writer
  settings/
    service.ts               settings operations
    lock.ts                  passcode hashing and recovery codes
  popup/                     toolbar popup
  options/                   rule list, add form, audit log, settings, lock screen, onboarding
  components/ui/             local shadcn-style primitives
  ui/                        download, display, cleanup copy, theme tokens
tests/                       Vitest suites
scripts/release.mjs          build, package, and checksum script
```

### Architecture rules

`core/*` is plain TypeScript with no browser globals. It is the only place matching logic lives. The background worker and both UIs call the same matcher; do not reimplement matching in a component or a listener.

The UI calls services directly. The only messages sent to the background worker are sweep requests: `sweep-rule` after a rule is saved and `sweep-now` after an import.

Every background listener is registered at the top level so a suspended MV3 worker wakes for it. Moving listener registration inside a callback breaks that.

Rule storage is a compact tuple format. The `KINDS` array in `src/storage/rules.ts` is the wire format: append new kinds only, never reorder the existing entries. The rule cap and the 7,000-byte sync budget are hard limits. Storage fails loudly instead of letting the browser drop a write.

Audit appends are serialized through a promise queue because history events can arrive in parallel. Keep that behavior if you change the audit storage.

### Tests

```sh
npm test
npm test -- tests/match.test.ts
npm test -- -t "matches a keyword"
```

The suite has two kinds of coverage:

- **Pure core tests** for normalization, tokenization, matching, validation, storage codecs, imports and exports, and sweep window math. `tests/match.test.ts` mirrors the match table in `docs/PLAN.md` §4.4.
- **Fake-browser tests** that boot the real background entry against stubbed `chrome` APIs. These cover live deletion, pause, audit failures, alarms, and sweep runs without launching a browser.

When you change matching behavior, add the case to the table-driven tests. When you add a rule kind, update all of these:

1. `RuleKind` and `matchRule` in `src/core/match.ts`.
2. `validateRule` and `resolveRuleInput` in `src/core/rules.ts`.
3. The `KINDS` list in `src/options/AddRuleForm.tsx`.
4. `ruleLabel` in `src/core/format.ts`.
5. The `KINDS` arrays in `src/storage/rules.ts` and `src/rules/import.ts`. Append only to the storage one.
6. Match, validation, and UI tests.

### UI

The UI uses React 18, Tailwind CSS 4, local shadcn-style components, and lucide icons. Design tokens live in `src/ui/theme.css`. Keep new controls accessible: labels, visible focus, keyboard submission, and status or alert roles for messages.

### Constraints for contributions

- Do not add permissions, network access, analytics, or remote code without discussing it first. The small permission set is part of the product.
- Keep `core/*` free of browser globals.
- Keep the promise copy and onboarding copy intact unless the product decision changes.
- Preserve the exact-match semantics. If a change makes `example.com` cover `www.example.com`, it is a product change, not a bug fix.

## Release process

Releases are tag-driven. The workflow checks that the tag matches `package.json`, then builds both targets, verifies the checksums, uploads the artifacts, and publishes the GitHub Release.

Bump the version in both places:

```sh
npm version 0.3.1 --no-git-tag-version
# set the same version in src/manifest.json
```

The release script fails on version drift between `package.json` and `src/manifest.json`. Then commit, tag, and push:

```sh
git add package.json package-lock.json src/manifest.json
git commit -m "release: 0.3.1"
git tag -a v0.3.1 -m "Histora 0.3.1"
git push origin main
git push origin v0.3.1
```

CI runs `npm ci`, `npm run typecheck`, `npm test`, `npm run release`, and `sha256sum -c SHA256SUMS` before publishing. Running the Release workflow by hand (`workflow_dispatch`) builds and uploads the artifacts without creating a release.

## Documentation

| File | Purpose |
|---|---|
| `docs/PRD.md` | Product requirements, user stories, and the promise. |
| `docs/PLAN.md` | Architecture, matching specification, deletion pipeline, data model, and accepted decisions. |
| `docs/SPIKE-M0.md` | Browser findings behind the live listener and sweep design. |
| `docs/TODO.md` | Execution state and milestone evidence. |

Read `docs/PLAN.md` before changing matching behavior or storage. Read `docs/TODO.md` for what is verified and what is still manual.

## License

MIT.
