# Histora — Plan

A browser extension that removes chosen pages from browsing history.

## 1. Product definition

**Promise (exact copy):** "Removed from history."

Never "not tracked", never "not stored", never "invisible". The extension deletes history entries; it cannot prevent the browser from writing them in the first place.

**Audience:** general users who want certain pages absent from their own history — personal hygiene, shared machines, gift shopping, medical searches. Not a parental-control or monitoring-defeat tool, and the listing must not imply that.

**Model:** post-hoc delete. A visit is recorded by the browser, `onVisited` wakes the extension, the entry is deleted. A periodic sweep reconciles anything that slipped through while the extension was disabled, suspended, updating, or crashed.

**Surface:** Chrome (and Chromium-derived: Edge, Brave, Arc), Firefox desktop. Safari is unsupported — its extension API has no history access at all, not even deletion.

**Non-goals (v1):** restore deleted history; per-visit granularity; clearing recently-closed tabs, downloads, autofill, or other stores; mobile; regex rules; matching on page titles; scoping a rule to a second condition.

## 2. Platform reality

| Requirement | Reality |
|---|---|
| Prevent the entry being written | Impossible. No API. Only delete after `onVisited`. |
| Hide (not delete) | Impossible. "Hide" = delete + keep rule. |
| Show again | Impossible. Stopping deletion does not restore. |
| Delete one visit, keep another to the same URL | Impossible. `deleteUrl` removes all visits to that URL. |
| Match before the row exists | Impossible. The event fires after the commit. |
| Incognito | Out of scope. History is not recorded in incognito anyway; the extension stays out of it. |
| MV3 service worker | Terminates when idle. Every listener must be a top-level registered handler; the sweep is load-bearing, not a fallback. |
| Auto-update | Only for store-distributed extensions. Off-store means manual reinstall (see §8). |

Consequence: the failure mode we must design around is not "the extension is wrong", it is "the extension was not running". That is what the sweep exists for, and why the audit log exists — the user otherwise has no evidence the feature works.

## 3. Architecture

```
src/
  background.ts            top-level listener registration only
  core/normalize.ts        URL string -> normalized parts (host, segments, query tokens)
  core/match.ts            (rules, url) -> { rule, reason } | null
  core/rules.ts            CRUD, validation, dedupe, cap
  core/format.ts           rule -> human label
  history/delete.ts        deletion + fallback
  history/sweep.ts         chunked reconciliation
  history/audit.ts         bounded local ring buffer
  storage/rules.ts         storage.sync wrapper
  popup/                   current tab -> one-tap host rules
  options/                 rule list, add form with live match preview, audit log, pause
```

`core/*` is pure TypeScript with no browser globals, so it is unit-testable in Node and is the only place matching logic exists. Background and UI both call it; nothing re-implements matching.

**Permissions:** `history`, `storage`, `alarms`, `activeTab`. No host permissions, no content scripts, no `tabs`, no network calls. Minimal permissions mean a shorter install warning and one less reason for a future reviewer to balk.

**Stack (locked):** extension.js 4.1.36 with React 18 + TypeScript. UI from shadcn/ui, icons from lucide. Design tokens follow Hallmark's guidance, monochrome: `#fdfbf7` surface, `#171717` primary, with pastel semantic colours derived to sit on the same warm ground rather than the platform defaults. Tokens and components arrive in M4; M0–M3 are headless, and `core/*` stays framework-free so the matcher never depends on the UI choice. `tldts` supplies public-suffix data; `vitest` runs the pure-core tests.

## 4. Filter model

Strict by decision: every kind matches exactly what it names, with no fan-out and no secondary condition. Both failure directions are invisible — under-matching leaks the visit, over-matching destroys unrelated history — so each kind is defined narrowly and the cost of that narrowness is stated where it bites.

### 4.1 Normalization

Applied to both the rule value and the URL before comparison.

- Lowercase scheme and host. Path case is preserved (servers treat paths case-sensitively).
- IDN hosts compared in punycode (the `URL` API already returns ASCII hostnames).
- Strip default port (`:80`, `:443`), strip trailing dot from host.
- Drop fragment (`#...`) entirely — never part of a match.
- Normalize path: ensure a leading `/`, strip a single trailing `/` (except root `/`).
- Only `http:` and `https:` URLs are matched. `file:`, `chrome:`, `about:`, `moz-extension:` are ignored — deleting extension or browser-internal entries is not a user need and invites bugs.
- Compare paths in both raw and percent-decoded form; match if either form matches. Guards against `/caf%C3%A9` vs `/café`.

### 4.2 Rule kinds

A rule is `{ id, kind, value, enabled, createdAt }`. There is no host field, no AND condition, no combinators: one rule, one condition.

| Kind | `value` | Semantics |
|---|---|---|
| `keyword` | free text, min 2 chars | Case-insensitive match against a **whole token**. Tokens are host labels, path segments, and query keys/values. |
| `domain` | a registrable domain (eTLD+1) | Exact host equality after normalization. `example.com` matches `example.com` only — **not** `www.example.com`, not `a.example.com`, not `notexample.com`. Input must be a registrable domain; bare public suffixes (`co.uk`, `com`) and hosts under a suffix (`blog.example.co.uk`) are rejected in this kind. |
| `subdomain` | any hostname | Exact host equality after normalization, for any host including registrable domains. `a.example.com` matches `a.example.com` only — not `b.a.example.com`, not `example.com`. No `www` folding. |
| `slug` | a path | Exact path equality, query and fragment ignored. Host-agnostic: the rule applies on every site. |

`domain` and `subdomain` evaluate identically; they differ only in validation and in what the UI says ("the site itself" vs "one host of the site"). That overlap is accepted: the user asked for four named filter types, and collapsing them would make the domain case silently accept `blog.example.co.uk` as if it were the site.

Strictness has three visible costs, all intentional:

1. **`example.com` does not cover `www.example.com`.** Most sites redirect there. The add form compensates by listing sibling hosts seen in history for that registrable domain and offering them as one-tap additions (§4.4) — the rule stays literal, the user does one more click.
2. **`keyword` is token-based, so `porn` does not match `pornography` or `pornhub`.** Whole-label matching is the only strict reading that does not need a regex engine.
3. **`slug` is host-agnostic.** `/blog/secret` deletes that path on every site. Making slug rules host-scoped would require the AND condition that was cut, so slug rules are created only in the options page, behind an explicit warning, and never from the popup.

`domain` validation needs the public suffix list. Use `tldts` (small, maintained) — hand-rolled eTLD+1 logic breaks on `co.uk`, `github.io`, `s3.amazonaws.com`, and that breakage is exactly the class of bug this plan is trying to avoid.

### 4.3 Token definition

`keyword` matching is deterministic and needs no regex:

```
tokens(url) = host labels        (host.split('.'))
            ∪ path segments      (path.split('/'), empty dropped)
            ∪ query keys/values  (search.split(/[&=]/), empty dropped)
match       = tokens.some(t => t.toLowerCase() === keyword.toLowerCase())
```

Encoded characters are decoded once before tokenizing; a decode failure falls back to the raw form.

### 4.4 Match table (executable spec)

| Rule | URL | Match | Why |
|---|---|---|---|
| keyword `porn` | `https://example.com/porn/1` | yes | path segment token |
| keyword `porn` | `https://porn.example.net/` | yes | host label token |
| keyword `porn` | `https://example.com/list?tag=porn` | yes | query value token |
| keyword `porn` | `https://pornography.example/` | no | token is `pornography` |
| keyword `porn` | `https://pornhub.com/` | no | token is `pornhub` — strict |
| keyword `porn` | `https://example.com/a-porn-b` | no | `a-porn-b` is one segment |
| keyword `Porn` | `https://example.com/PORN` | yes | case-insensitive |
| domain `example.com` | `https://example.com/` | yes | host equal |
| domain `example.com` | `https://www.example.com/` | no | different host — strict |
| domain `example.com` | `http://example.com:8080/x` | yes | port irrelevant |
| domain `example.com` | `https://notexample.com/` | no | different host |
| domain `example.com` | `https://example.com.evil.co/` | no | different host |
| domain `co.uk` | — | rejected | bare public suffix |
| domain `blog.example.com` | — | rejected | not registrable; use `subdomain` |
| subdomain `www.example.com` | `https://www.example.com/x` | yes | host equal |
| subdomain `www.example.com` | `https://example.com/` | no | different host |
| subdomain `a.b.example.com` | `https://a.b.example.com/` | yes | any host accepted |
| subdomain `a.example.com` | `https://b.a.example.com/` | no | host equal only |
| slug `/blog/secret` | `https://any.site/blog/secret` | yes | exact path |
| slug `/blog/secret` | `https://any.site/blog/secret?utm=1` | yes | query ignored |
| slug `/blog/secret` | `https://any.site/blog/secret/` | yes | trailing slash normalized |
| slug `/blog/secret` | `https://other.site/blog/secret` | yes | host-agnostic by design — the cost |
| slug `/blog/secret` | `https://any.site/blog/secret-2` | no | not equal |
| slug `/blog/secret` | `https://any.site/blog/secret/child` | no | exact, not prefix |
| slug `/Blog/Secret` | `https://any.site/blog/secret` | no | path case preserved |
| slug `/café` | `https://any.site/caf%C3%A9` | yes | decoded comparison |
| keyword `porn` | `file:///home/u/porn.txt` | no | non-http scheme ignored |
| any | `https://site/#frag` | — | fragment stripped before compare |

### 4.5 Over-deletion guard: preview before save

Before a rule is armed, run `history.search` and show the count plus the first five matching entries: *"This rule matches 412 history entries: github.com/x, github.com/y, …"*. The user confirms. This is not skippable and has no "don't ask again".

For `domain` rules the preview also scans for sibling hosts of the same registrable domain (`www.`, `m.`, locale prefixes) and lists them as one-tap additions, which is how the strict "no fan-out" semantics stay usable.

For `slug` rules the preview leads with the host list the path was seen on, because a global path rule is the one rule kind whose blast radius the user cannot see from the rule text alone.

## 5. Deletion pipeline

### 5.1 Live path

```
history.onVisited (url, lastVisitTime)
  -> normalize(url)
  -> match(rules, url)                        first match wins, for the audit reason
  -> history.deleteUrl({ url })               raw URL as received
  -> if the call throws or the entry still exists:
       deleteUrl({ url: href })               normalized form, trailing slash etc.
  -> audit.append({ t, url, ruleId, ruleLabel })
  -> if both fail: audit.append(failure), and let the sweep retry
```

Deleting the raw string and the normalized `href` covers the case where the stored entry differs by trailing slash or host case. Both calls are idempotent.

Redirect chains: `onVisited` can fire for intermediate hops. Each is matched independently — correct, since each hop produces its own history entry.

### 5.2 Sweep

- Triggers: `onInstalled`, `onStartup`, a one-off run about 60 s after install (the install-time first navigation is missed on both browsers — see `SPIKE-M0.md`), and a `chrome.alarms` entry every 6 hours.
- One pass over history via `history.search({ text: '', startTime, endTime, maxResults: 5000 })` per 7-day window, newest first, re-sorted by `lastVisitTime` so the order is ours and not the engine's. Rules are evaluated in memory; no per-rule search.
- Window: last 90 days by default (`sweepWindowDays`), user-adjustable, `0` = entire history.
- Budget: max 5,000 entries per run. If exhausted, the cursor records the `lastVisitTime` of the last entry handled and the next alarm resumes there, so a window bigger than the budget still makes progress. Entries newer than the cursor are skipped on resume.
- Overlapping runs are prevented by a `lockAt` timestamp in `storage.local`, cleared in a `finally`, with a 5-minute stale-lock timeout.
- Sweep and live path share `core/match.ts`; there is no second matcher.

Chrome's `deleteUrl` and `search` have no documented rate limit, but a per-run budget keeps the service worker from being killed mid-sweep and bounds the damage of a pathological rule.

## 6. Data model

```
Rule  { id: string, kind: 'keyword'|'domain'|'subdomain'|'slug',
        value: string, enabled: boolean, createdAt: number }
Audit { t: number, url: string, ruleId: string, ruleLabel: string,
        result: 'deleted'|'failed' }
```

- Rules: `storage.sync`, one item, compact tuple encoding, cap 200 rules. Chrome's sync quota is 8 KB per item, so the cap is a hard requirement, not a preference. Exceeding it fails loudly at validation rather than silently dropping rules.
- Audit: `storage.local` ring buffer, cap 500, trimmed oldest-first. Never synced, never transmitted, clearable.
- Settings: `storage.local` (`paused`, `sweepWindowDays`, `lastSweepAt`).
- No telemetry, no network requests, no remote config.

## 7. UI

**Popup** (activeTab, no extra permission): current URL, and two one-tap buttons — "Never keep this site" (domain rule for the current registrable domain) and "Never keep this subdomain" (subdomain rule for the current host). Plus a global pause toggle and a link to the audit log. No slug creation here: a host-agnostic path rule is not something to arm by accident from a one-click surface.

**Options page** (opened in a tab via `options_ui`): rule list with human labels ("Only the exact site example.com", "Only the exact host www.example.com", "This path on every site: /blog/secret"), per-rule enable/disable, delete, and the add form with live preview. Slug creation lives here, behind a one-line warning. Below, the audit log: what was removed, when, by which rule. When a domain preview finds the same site under other hosts (`www.`, `m.`, locale prefixes), each is offered as a one-tap exact-host rule rather than being silently left out of the count.

**Onboarding, one screen, shown once:** the promise and its limits, three lines.

> Histora removes pages from your history after you visit them.
> It cannot stop the visit being recorded for a moment, and it cannot clear recently closed tabs, downloads, or history on other devices.
> Nothing leaves your browser.

Silent per-visit behavior is intended: no toast, no badge, no notification. The audit log is the evidence, reachable in two clicks from the popup.

## 8. Distribution

No store for Chrome. Firefox on AMO plus GitHub Releases for both.

| Artifact | Channel | Notes |
|---|---|---|
| Chrome / Chromium | GitHub Release zip, source-buildable | User downloads, unzips, loads via `chrome://extensions` → developer mode → Load unpacked. |
| Firefox | AMO listing **and** the same signed file in the GitHub Release | AMO provides discovery and review; the release asset keeps both browsers on one version. |

Hard constraints this creates:

- **Firefox requires a signature.** A release-channel Firefox will not keep an unsigned XPI: `about:debugging` temporary installs vanish on restart. The GitHub-release XPI must therefore be the AMO-signed artifact (`web-ext sign --channel unlisted` if we ever skip the public listing). The release and the AMO upload must come from the same build, or version strings drift.
- **No auto-update.** Off-store extensions do not update themselves, and this extension makes no network requests, so it cannot check for updates. Every release requires the user to reinstall. Ship the version in the popup and in the audit log header so support can tell builds apart.
- **Chrome nags.** Unpacked extensions trigger the developer-mode warning on Windows and macOS startup, and Chrome may require re-enabling after a policy change. On Linux it is quiet. This is the visible cost of skipping the store.
- **Trust signal is the repo.** Install instructions, SHA-256 checksums per artifact, and a short README are part of the deliverable, not documentation debt. A general audience installing from GitHub is the weakest part of this plan; accepted deliberately to avoid review dependence and the "Read and change all your browsing history" prompt at first contact.
- **Store later is still open.** The build is MV3, no remote code, no host permissions, so the same zip can be submitted to the Chrome Web Store unchanged if distribution becomes the bottleneck. Nothing in the code depends on the current channel.
- **Enterprise** fleets may block self-distributed extensions via policy; an accepted limitation, not a bug to chase.

## 9. Milestones

| M | Scope | Done when |
|---|---|---|
| M0 | extension.js scaffold, MV3, Chrome + Firefox | a test page writes history; `onVisited` fires and `deleteUrl` removes it on both |
| M1 | `core/*` + tests | the §4.4 table passes as unit tests, including token, PSL, and slug cases |
| M2 | background wiring, audit log | a matched visit disappears within ~1 s and appears in the audit log |
| M3 | sweep + alarms + cursor | disable extension, visit matched page, re-enable → sweep removes it |
| M4 | popup + options + preview | host rules added in one tap; slug rule requires the warning; preview counts correct |
| M5 | Firefox build + manual matrix | same behavior on Firefox, including `browser.history` differences and the signed-XPI path |
| M6 | release packaging | zip + signed XPI + checksums + README; a clean profile installs both per the README |

## 10. Verification

- Unit: §4.4 match table, tokenization edge cases, normalization (IDN, ports, trailing slash, percent-encoding), PSL validation (`co.uk` rejected, `blog.example.co.uk` rejected in `domain`), rule cap.
- Manual, per browser: visit → gone from history and from the omnibox dropdown; unmatched sites untouched; `www.example.com` untouched by an `example.com` rule (strictness verified deliberately, not by accident); service worker killed via `chrome://serviceworker-internals`, then visit → still deleted after wake; extension disabled → sweep on re-enable recovers it; pause actually pauses; audit log trims at 500.
- Negative: `file://`, `chrome://`, incognito — confirm ignored.
- Install: fresh profile, follow README only, both browsers.

## 11. Risks

| Risk | Mitigation |
|---|---|
| A host-agnostic slug rule destroys unrelated history | Options-page only, warning at creation, preview lists affected hosts |
| User adds `example.com`, visits redirect to `www.example.com`, sees it kept | Sibling-host suggestions in the add preview; onboarding says "the exact host" |
| User believes the promise is stronger than it is | Onboarding states the limits; no "invisible" wording anywhere |
| Silent failure looks like success | Audit log records failures, not just deletions |
| MV3 worker eviction | Top-level listeners, sweep cursor, alarms, idempotent deletion |
| `storage.sync` quota silently dropping rules | Compact encoding, 200-rule cap, loud validation error |
| Off-store distribution means manual updates and install friction | Version string in UI, checksums, README, store path kept open |

## 12. Decisions (accepted)

1. Post-hoc delete + sweep; no user-triggered manual deletion.
2. Chrome + Firefox desktop; Safari unsupported.
3. All four rule kinds strict: `domain` and `subdomain` are exact host equality, `keyword` matches whole tokens, `slug` matches an exact path.
4. No host scope field, no compound rules. Slug rules are host-agnostic and options-page only.
5. Promise copy is "Removed from history".
6. Silent per-visit behavior; the audit log is the evidence.
7. Distribution: Firefox on AMO, both browsers via GitHub Releases; no Chrome Web Store.
8. Sweep window 90 days, rule cap 200, keyword matches URLs not titles, no context-menu entry.
9. Rule id is deterministic: `` `${kind}:${value}` ``. It survives the storage round trip, keeps audit entries pointing at the same rule, and lets the sync payload omit ids. The kind+value pair is already the duplicate key.
10. Rules live in `storage.sync` as compact rows `[kindIndex, value, enabled, createdAtSeconds]` under a 7000-byte guard. The byte budget, not the 200-rule cap, is the binding limit for long values; the save fails loudly rather than letting sync drop a write.
11. The sweep cursor is the `lastVisitTime` of the last entry handled, not a window boundary, so a run that exhausts its budget inside one window cannot loop on it.
12. The M2 popup is an information shell (version, rule count, 20 most recent removals). Rule actions, the current-site controls, and the full audit view belong to M4.
13. The options page is `options_ui` with `open_in_tab: true`; the popup relies on `activeTab`, so the current page's URL is readable only after an action click. Pages call the rule/settings services directly — no message hop — and send one `sweep-rule` message after a save so the new rule cleans history immediately.
14. A preview counts distinct URLs from the same `history.search({text, maxResults: 200})` a manual check would run, filtered by `match`, so the number shown is the number the save will act on. Sibling hosts on a domain preview are listed separately and never added to that count.
15. Firefox parity (audited against mozilla-central and MDN): `history.search`/`deleteUrl` behave as on Chrome when `startTime` and `maxResults` are explicit; the sync quotas are the same 102400/8192/512; Firefox imposes no alarm minimum. Two differences are handled in code — Firefox keeps alarms in memory only, so the 6-hour alarm is recreated in `onStartup`, and both engines size `storage.sync` in UTF-8 bytes, so the 7000-byte guard measures encoded bytes rather than UTF-16 length.
16. Chrome records same-document `pushState` navigations as visits and the `onVisited` listener deletes them; Firefox does not write them to Places, so there is nothing to delete and the sweep never sees them. Both outcomes satisfy the promise; the popup never claims a page was never stored.
17. Pause stops both removal paths: the live `onVisited` listener checks `settings.paused` before matching, and `runSweep` returns `skipped: 'paused'`.
18. The options passcode is a local gate, not encryption, and the copy says so. Only a PBKDF2-SHA256 hash (210k iterations, per-install salt) is stored in `storage.local`; the PIN itself never is. Five wrong attempts start a 30-second cooldown that survives a reload. The backup code is 16 Crockford-base32 characters (80 bits, grouped 4-4-4-4), hashed the same way, shown once with copy and `.txt` download; using it turns the passcode off rather than acting as a permanent second key. Someone who can clear extension storage or open devtools can bypass the gate — that limit is stated on the lock screen instead of being papered over.
19. Modals are limited to four moments: adding a rule (one focused task, opened from the Rules header), showing the one-time backup code (blocking — no close button, and Escape or an outside click do not dismiss it), confirming a clear of the audit log, and confirming that the passcode is being turned off. Deleting a single rule stays one click and the onboarding notice stays inline: both are cheap to undo or read in place, and a dialog there would only add friction.
