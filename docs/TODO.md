# TODO — Histora execution

Tracks *state* only. What and why live in `PLAN.md` and `PRD.md`, in this directory.

## How to use

- Work top-down by milestone. Finish a milestone's acceptance line before starting the next.
- Mark `[ ]` todo, `[~]` in progress, `[x]` done, `[!]` blocked — when blocked, write the reason on the same line.
- Never tick a box without running its acceptance check. If the check is manual, write what you saw.
- **M0 can invalidate the plan.** Do not start M1 until `SPIKE-M0.md` exists and says whether the assumptions in `PLAN.md` §2 and §5.2 hold.
- A decision that changes behaviour gets recorded in `PLAN.md` §12 first, then implemented.

## Locked decisions (do not re-litigate while executing)

Post-hoc delete + sweep · Chrome + Firefox desktop, no Safari · four strict rule kinds, no host scope, no compound rules · path rules are host-agnostic and options-only · promise copy is "Removed from history" · silent per-visit behaviour with a local audit log · Firefox via AMO plus GitHub Releases for both, no Chrome Web Store · sweep window 90 days · 200-rule cap · keyword matches URLs, not titles.

**Stack:** extension.js 4.1.36 · React 18 + TypeScript · shadcn/ui components · lucide icons · Hallmark-directed monochrome tokens (`#fdfbf7` surface, `#171717` primary, pastel semantic colours derived on that ground). `core/*` stays framework-free, so no UI choice can leak into the matcher. Styled UI starts at M4; M0–M3 are headless.

## M0 — Spike: falsify the assumptions

- [x] Scaffold the extension.js project (TypeScript, MV3, Chrome + Firefox targets), dev build runs on both
- [x] Register top-level `history.onVisited` and `alarms` listeners in the background entry
- [x] Chrome: visit a probe page, then confirm `deleteUrl` removes the entry
- [x] Firefox: same probe, same result
- [x] SPA test: `pushState` route change — does `onVisited` fire, and with which URL?
- [x] Redirect test: chain through two hops — how many entries appear, how many events fire?
- [x] Suspension test: resolved in M2 — with a raw CDP profile that never attaches to the worker, the `service_worker` target disappears after the idle timeout and a visit still restarts it and deletes the entry. See `SPIKE-M0.md` §4
- [x] Record findings in `SPIKE-M0.md`: event latency, SPA coverage, redirect behaviour, `deleteUrl` URL-variant behaviour, and anything that changes `PLAN.md` §5.2 or the onboarding copy

**Acceptance:** met — both browsers delete a probe visit in 3–90 ms, and `SPIKE-M0.md` states which assumptions held and which did not.

## M1 — Core (pure, no browser globals)

- [x] URL normalization: lowercase scheme+host, punycode, default ports, trailing dot, fragment drop, leading slash, single trailing slash, scheme filter (`http`/`https` only), percent-decode fallback
- [x] Tokenizer per `PLAN.md` §4.3
- [x] `keyword` matcher (whole-token, case-insensitive)
- [x] `domain` matcher (exact host, input validated as eTLD+1 via `tldts`)
- [x] `subdomain` matcher (exact host, any host)
- [x] `slug` matcher (exact path, raw and decoded forms)
- [x] `match(rules, url)` — OR across rules, first match wins, returns the rule for the audit reason
- [x] `validate(kind, input)` — rejects bare public suffixes and non-registrable `domain` input, enforces keyword minimum length, normalizes the stored value, rejects duplicates
- [x] Rule cap of 200 with a loud error, never silent truncation
- [x] Table-driven tests: every row of `PLAN.md` §4.4, plus IDN, non-default port, trailing slash, percent-encoding, `co.uk` / `blog.example.co.uk` rejection

**Acceptance:** met — 59 tests green (`npm test`), `tsc --noEmit` clean, both browser builds still succeed with `src/core/` present. Match rows live in `tests/match.test.ts` (§4.4 verbatim), rejection rows in `tests/rules.test.ts`.

## M2 — Live removal + audit log

- [x] Wire `onVisited` → normalize → match → delete raw URL, then normalized `href` if the entry survives
- [x] Audit append for `deleted` and `failed`, 500-entry ring buffer, oldest trimmed
- [x] Popup shell: version string, rule count, 20 most recent removals. Current-site controls and the audit view move to M4 (`PLAN.md` §12.12). Verified in the built popup: title, version, empty state, rule count, both result tags, promise copy, no console errors (`/tmp/opencode/popup-smoke.mjs`)
- [x] Failure path leaves the entry for the sweep instead of swallowing the error
- [x] Verify deletion still happens after MV3 worker eviction, using a plain profile with no debugger attached (carried over from M0)

**Acceptance:** met. Real Chromium run against `dist/chrome` (`/tmp/opencode/e2e-m2.mjs`): a matched visit is deleted and audited within ~1 s, an unmatched page is untouched and writes no entry, the audit ring stays at 500 after a 501st append. The failure path and the "unreadable rule list" path are covered by `tests/background.test.ts` against a fake browser (a real `deleteUrl` failure cannot be provoked). Eviction proven over raw CDP without attaching to the worker: the `service_worker` target disappears after idling, the next visit restarts it, and the audit shows the deletion (`/tmp/opencode/evict-cdp.mjs`).

## M3 — Sweep

- [x] `history.search` pass chunked into 7-day windows, newest first, rules evaluated in memory
- [x] Window setting, default 90 days, `0` = everything
- [x] Per-run budget of 5,000 entries with a persisted cursor that resumes on the next alarm
- [x] Stale-lock flag prevents overlapping runs
- [x] Triggers: `onInstalled`, `onStartup`, a one-off run about 60 s after install, 6-hour alarm
- [x] Rule confirmation triggers an immediate bounded cleanup for that rule

**Acceptance:** met in the browser for the sweep itself (`/tmp/opencode/e2e-m2.mjs`): an entry seeded with no rule armed is removed after a `sweep*` alarm, the removal is audited, the lock is released, and a paused sweep changes nothing. Budget resume, newest-first ordering, per-rule scoping, and stale-lock takeover are covered by `tests/sweep-run.test.ts` against a fake browser (the disable/re-enable and 1-minute-alarm variants of the old wording need the M5 manual matrix, since a test harness cannot toggle the extension mid-run). Cursor semantics changed to make resume progress-guaranteed — recorded in `PLAN.md` §12.11.

## M4 — UI

- [x] Popup: "Never keep this site" (domain rule for the current registrable domain), "Never keep this subdomain" (current host), global pause toggle, audit log link. No path rule here
- [x] Options: rule list with plain-language labels, per-rule enable/disable, delete
- [x] Add form: mandatory preview with match count and first five entries, no "don't ask again"
- [x] Domain preview offers sibling hosts found in history (`www.`, `m.`, locale prefixes) as one-tap additions
- [x] Path-rule form behind the host-agnostic warning, and the preview leads with the hosts the path was seen on
- [x] First-run screen with the three onboarding lines from `PLAN.md` §7 verbatim
- [x] Settings: sweep window, pause state, version

**Acceptance:** a host rule can be added from the popup in two clicks; a path rule cannot be created anywhere except the warned options form; preview counts match a manual `history.search`; labels read as plain English.

**Evidence (M4):** Tailwind v4 + shadcn/ui + lucide are installed and build into both targets (`postcss.config.mjs`, `@tailwindcss/postcss`, `src/ui/theme.css`). `/tmp/opencode/e2e-m4.mjs` against the built Chrome extension: 31/31 PASS — onboarding lines verbatim and dismissed once, preview count equal to a manual `history.search` (2/2), sibling hosts offered and one-tap switched to an exact-host rule, domain rule saved and both entries removed and audited immediately, slug warning shown with the hosts the path was seen on, enable/disable/delete persisted in `storage.sync`, pause persisted across reload, audit clear, popup renders with no page errors. `97` unit tests green, `tsc --noEmit` clean, `sloplint src/ui/theme.css --genre modern-minimal` clean, both builds succeed (~468 KB).

**Gap:** Playwright cannot click the toolbar action, so `activeTab` is never granted to the popup opened as a tab; the automated run verifies the popup's unavailable state and `currentSite()` is unit-tested, but "add a host rule from the popup in two clicks" is a manual row in the M5 matrix.

## M5 — Firefox parity + manual matrix

- [x] Firefox build: confirm `browser.history` differences, `browser.storage.sync` quota behaviour, alarm minimums

  Parity audit (sources in `PLAN.md` §12.15–12.17): `history.search`/`deleteUrl` are equivalent and every call passes explicit `startTime`/`maxResults`; sync quotas are the same 102400/8192/512 on both; Firefox has no alarm minimum, so 1 min and 360 min are safe. Two real differences were found and fixed: alarms live only in memory in Firefox, so the 6-hour alarm is now recreated in `onStartup`; and both browsers measure the sync budget in UTF-8 bytes while the guard compared UTF-16 `.length`, so the guard now measures the encoded bytes. One behaviour is Firefox-specific by design: Chrome records `pushState` routes as visits and deletes them on `onVisited`, Firefox does not put them in Places at all, so there is nothing to delete.
- [ ] Signed-XPI path exercised (`web-ext sign --channel unlisted`) and the install survives a Firefox restart
- [ ] Run the full manual matrix below on both browsers

**Acceptance:** matrix fully ticked on Chrome and Firefox, with the observed result written next to any row that needed interpretation.

## M6 — Release

- [x] `git init` and first commit (prerequisite for released artifacts)
- [x] Build script producing the Chrome zip and the Firefox XPI from the same build
- [x] SHA-256 checksums per artifact

  `npm run release` asserts `package.json` and `src/manifest.json` agree on the version, builds both targets, packages `dist/release/histora-<version>-chrome.zip` and `.xpi` with the manifest at the archive root, and writes bare-name `SHA256SUMS`; `sha256sum -c` passes from `dist/release/`.
- [x] `README.md`: install steps for both browsers, what the extension cannot do, version/checksum table
- [ ] AMO submission decided (listed vs unlisted) and uploaded; the release asset is the AMO-signed file
- [x] Extension icon taken from the wordmark (the H only) at 16/32/48/128, wired to `icons` and `action.default_icon`; the source image is not committed
- [x] Version string bumped in one place and visible in the popup and audit header

  `package.json` is the source; `scripts/release.mjs` fails the build if `src/manifest.json` drifts. The popup header and the options settings section both read the manifest version.

**Acceptance:** a clean browser profile installs both artifacts using only `README.md`, and checksums verify.

## Manual verification matrix (M5 and every release)

Chrome column: `/tmp/opencode/e2e-matrix.mjs` against the built extension, 10 PASS / 0 FAIL / 5 SKIP. Firefox column: not run yet — needs the signed XPI path.

| Row | Chrome | Firefox |
|---|---|---|
| A matched visit is gone from history and from omnibox suggestions within ~1 s | history PASS (+74 ms, audit `domain:a1.matrix.test`); omnibox SKIP(manual) | — |
| An unmatched site is untouched | PASS | — |
| `www.example.com` survives an `example.com` rule — strictness verified deliberately | PASS | — |
| Kill the service worker, then visit → still removed after wake | PASS (M2, raw CDP: worker target absent after idle, deletion still audited) | — |
| Disable the extension, visit, re-enable → sweep removes it | SKIP(manual): `chrome://extensions` toggle cannot be driven honestly | — |
| Pause stops removal; resume restarts it | PASS after fix — the live `onVisited` path ignored `paused`; it now checks settings before matching | — |
| Disabling one rule stops removal for that rule only | PASS | — |
| A path rule fires on a second site with the same path (expected, by design) | PASS | — |
| `file://`, `chrome://`, and incognito are untouched | file:// PASS (kept through a keyword sweep), `chrome://` never enters history; incognito SKIP(manual) | — |
| IDN rule entered in native script matches the punycode URL | PASS (`münchen.de` stored as `xn--mnchen-3ya.de`, entry removed) | — |
| 201st rule fails loudly with a message the user can act on | PASS ("You already have 200 rules…", stored count stays 200) | — |
| Audit log: failure entries visible, oldest trimmed at 500, clear button works | PASS | — |

**Still manual:** disable/re-enable, incognito, omnibox suggestions, the whole Firefox column (needs `web-ext sign --channel unlisted` and a real Firefox profile), and "add a host rule from the popup in two clicks" (Playwright cannot click the toolbar action, so `activeTab` is never granted to a popup opened as a tab).

## Open questions

- SPA soft navigations: resolved in M0 — `onVisited` fires for `pushState` on both engines, so no extra listener. The install-time first navigation *is* missed, which is why the sweep gained a 60-second post-install trigger.
- Whether a `pushState` URL actually enters history or is never recorded: cosmetic, nothing leaks either way, so it does not gate M1.
- AMO listing visibility: decide at M6, does not affect code.
- Chrome Web Store: deliberately deferred; the build stays MV3, no remote code, no host permissions so it remains submittable unchanged.
- Sync byte budget vs the 200-rule cap: 200 rules with ~45-character paths encode to about 11.7 KB and are rejected by the 7000-byte guard, so the byte budget binds before the count cap for long values. Accepted for v1 — the save fails loudly with an actionable message (`tests/storage.test.ts`). If real users hit it, the options are shorter values or moving rules to `storage.local` and losing cross-device sync.

## Definition of done (v1)

All milestone acceptance lines pass, the manual matrix is green on Chrome and Firefox, both release artifacts install from `README.md` alone, and every user-facing string still says "Removed from history" rather than anything the code cannot honour.
