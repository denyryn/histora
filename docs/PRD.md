# PRD — Histora: filtered browsing history

Status: ready for execution. Derived from `PLAN.md` (§1–§12) in this directory. Progress is tracked in `TODO.md`; decisions that change the plan get recorded in `PLAN.md` §12 first.

## Problem Statement

People visit pages they do not want in their browsing history: a gift they are shopping for, a medical question, a job search while employed, a shared laptop in a living room. The browser records all of it permanently and surfaces it in the address bar in front of anyone who types the same first letters. The only tool available is "clear everything", which punishes the user for wanting a normal history of everything else — and forces them to choose between a useful history and a private one on every single occasion.

Existing history cleaners work at the wrong granularity: they clear ranges, wipe on exit, or delete everything. None of them answer the actual question — "keep my history, except this site, this subdomain, this page, or anything containing this word".

Two further facts make the problem harder than it looks, and any honest product has to live with them:

- No browser API prevents a history entry from being written. An extension can only delete it afterwards, which means a brief exposure window and a permanent leak whenever the extension is not running.
- History is one of many stores. Recently closed tabs, session restore, downloads, autofill, other profiles, and other devices keep their own copies.

## Solution

A desktop browser extension for Chrome (and Chromium-derived browsers) and Firefox that deletes matching history entries within about a second of the visit, and repairs gaps afterwards.

The user builds a list of rules, each one strict and single-purpose:

- a **keyword** that matches a whole token of the URL (host label, path segment, query key or value),
- an **exact domain** (`example.com` — the site itself, not its subdomains),
- an **exact subdomain** (`mail.example.com` — that host only),
- an **exact path** (`/blog/secret` — that path, on any site).

Adding a rule from the open page is two clicks in the toolbar popup. Adding one from the options page shows a **preview first**: how many existing history entries the rule matches, the first few of them, and — for a domain rule — which sibling hosts (`www.`, `m.`) exist for that site so they can be added in the same step. Confirming a rule removes the entries it already matches, so the user does not wait for the next background pass.

Removal is silent: no toast, no badge, no notification. The evidence is a local **audit log** that names what was removed, when, and by which rule — and records failures too, so a silent leak is never mistaken for success.

Nothing leaves the device. No telemetry, no network requests, four permissions, no host access.

The promise is exactly one sentence, used everywhere: **"Removed from history."** Not "not tracked", not "not stored", not "invisible".

## User Stories

1. As a general user, I want to remove one site from my history without clearing everything else, so that I keep an intact record of my normal browsing.
2. As a user shopping for a gift on a shared laptop, I want that shopping site gone from history and from autocomplete, so that the surprise survives until the day itself.
3. As a user researching a medical condition, I want those pages absent from my history, so that I never have to explain them to anyone who uses this machine.
4. As a user who only remembers the site name, I want to add a rule by domain, so that I do not need the exact URL in hand.
5. As a user who cares about one specific subdomain, I want to target only `mail.example.com`, so that the rest of that site still records normally.
6. As a user with a long unguessable URL, I want to target the exact path, so that only that page is dropped while the rest of the site stays.
7. As a user who does not know the domain, I want to match by keyword, so that I can catch a class of pages by a word that appears in the host, path, or query.
8. As a user browsing a page I want gone, I want to add it from the toolbar in one click, so that I do not have to copy and paste a URL.
9. As a user in the popup, I want both "this site" and "this subdomain" offered, so that I pick the right strictness without knowing the terminology.
10. As a user about to save a rule, I want to see how many existing entries it matches, so that I do not destroy history by accident.
11. As a user about to save a rule, I want to see a few example entries, so that I recognize a mistake before it is armed.
12. As a user adding `example.com`, I want to be told that `www.example.com` is a different host and offered as a one-tap addition, so that the site actually stops recording instead of appearing to.
13. As a user adding a path rule, I want a clear warning that it applies on every site, so that I understand the one rule kind with a wide blast radius.
14. As a user confirming a rule, I want the entries it already matches removed immediately, so that today's problem is solved today.
15. As a user who just visited a matching page, I want the entry gone within about a second, so that the feature feels immediate rather than scheduled.
16. As a user, I want removed visits to disappear from the address bar suggestions too, so that the next person typing the same domain does not see it.
17. As a user, I want no popup, badge, or notification when a visit is removed, so that my browsing stays quiet.
18. As a user, I want an audit log of what was removed and by which rule, so that I have evidence the extension is doing its job.
19. As a user, I want failed removals listed in the audit log, so that I can tell the difference between "nothing matched" and "it did not work".
20. As a user, I want a single pause switch, so that I can browse without the feature for a while without deleting my rules.
21. As a user, I want to disable one rule without deleting it, so that I can experiment or take a break from a single site.
22. As a user, I want my rules to survive browser restarts and updates, so that I set them up once.
23. As a user with more than one machine on the same browser profile, I want my rules to sync, so that I do not retype them.
24. As a user, I want one clear explanation at first run of what the extension cannot do, so that I do not rely on it for something it cannot deliver.
25. As a user, I want to be told that recently closed tabs, downloads, and other devices are not covered, so that I can act accordingly instead of assuming.
26. As a user, I want the extension to make no network requests, so that nothing about my browsing leaves the machine.
27. As a user, I want the install prompt to request as few permissions as possible, so that I have a reason to trust it.
28. As a user whose extension was disabled for a week, I want the missed entries cleaned up when it comes back, so that the gap is not permanent.
29. As a user, I want cleanup to run periodically in the background, so that I do not have to remember to trigger it.
30. As a user with a large history, I want a long cleanup to resume where it stopped, so that it finishes instead of stalling or restarting forever.
31. As a Firefox user, I want the same behavior as on Chrome, so that my browser choice does not change what the product is.
32. As a user of Edge, Brave, or Arc, I want it to work, so that preferring a Chromium browser does not exclude me.
33. As a Safari user, I want to be told it is unsupported, so that I do not install something that cannot work there.
34. As a user, I want to delete a rule and have removal stop for it, so that I can change my mind.
35. As a user, I want to know that removing a rule does not bring back deleted entries, so that I am not surprised there is no undo.
36. As a user with many rules, I want a clear error when I hit the limit rather than silent loss, so that I know to remove something.
37. As a user reporting a problem, I want the version number visible in the UI, so that support can tell builds apart.
38. As a user installing from a release page, I want short install steps and checksums, so that I can verify what I am installing.
39. As a user, I want internal pages, local files, and incognito left alone, so that the extension never interferes with browser internals or breaks private browsing.
40. As a user, I want uppercase keywords and hosts to match regardless of case, so that I do not have to remember capitalization rules.
41. As a user, I want path matching to respect case, so that it behaves like the web actually does.
42. As a user with a non-English domain, I want to add it in my own script, so that unicode hostnames work without converting them to punycode myself.
43. As a user, I want trailing slashes and port numbers not to create duplicate variants of the same site, so that rules behave predictably.
44. As a user reading the rule list, I want each rule described in plain language, so that I can tell what I armed without decoding syntax.
45. As a user, I want to clear the audit log, so that the log does not become the record I was trying to avoid.
46. As a support person, I want the audit log to name the rule that fired, so that diagnosing a report does not require guessing.
47. As a maintainer, I want all matching logic in one pure module, so that a new rule kind cannot fork behavior between the live path and the sweep.
48. As a maintainer, I want the artifact uploaded for review and the artifact shipped in the release to be the same build, so that version drift does not create phantom bugs.

## Implementation Decisions

**Rule model.** A rule is `{ id, kind, value, enabled, createdAt }`. No host field, no AND condition, no combinators: one rule, one condition. Four kinds, evaluated with OR semantics across the list; the first matching rule wins so the audit log has a single reason. Rule list is capped at 200.

**Strict semantics per kind.** This is the decision that most shapes the product, so it is stated as behaviour, not preference:

- `keyword`: case-insensitive equality against a single token, where tokens are host labels (`host.split('.')`), path segments (`path.split('/')`, empties dropped), and query keys/values (split on `&` and `=`). Substring matching is rejected: it is the failure mode that deletes unrelated history.
- `domain`: exact host equality, and the input must be a registrable domain (eTLD+1). Bare public suffixes and hosts under a suffix are rejected in this kind with a pointer to `subdomain`.
- `subdomain`: exact host equality for any host, including registrable domains. No `www` folding.
- `slug`: exact path equality, query and fragment ignored, host-agnostic by design.

`domain` and `subdomain` evaluate identically and differ only in validation and label. The overlap is accepted: collapsing them would allow `blog.example.co.uk` to be entered as if it were the whole site. The three visible costs of strictness — `example.com` not covering `www.example.com`, keywords not matching mid-word, and path rules applying on every host — are intentional and are compensated in the add flow, not in the matcher.

**URL normalization** is shared by rules and URLs: lowercase scheme and host, punycode IDN hosts, strip default ports and trailing dot, drop fragments, ensure a leading slash and strip a single trailing slash except root, match paths in both raw and percent-decoded form, and ignore every scheme except `http:` and `https:`.

**Public suffix data.** Registrable-domain validation uses a maintained public-suffix library rather than hand-rolled suffix logic, because the hand-rolled version misclassifies `co.uk`, `github.io`, and `s3.amazonaws.com` — exactly the inputs that would silently widen a rule.

**Preview before arming (mandatory).** Before a rule is saved, a history search runs for that rule and the user sees the match count plus the first five entries; confirmation is required and there is no "don't ask again". For `domain` rules the preview also lists sibling hosts of the same registrable domain found in history, offered as one-tap additional rules. For `slug` rules the preview leads with the hosts the path was seen on. Confirming a rule also triggers an immediate bounded cleanup for that rule, which is what makes the feature feel on-demand rather than scheduled.

**Removal.** On `onVisited`, normalize, match, then delete the raw URL string as received; if that throws or the entry survives, delete the normalized form. Both calls are idempotent. Every outcome — deleted or failed — is appended to the audit log; failures are left for the sweep to retry. Redirect-chain hops are matched independently because each hop is its own history entry.

**Sweep.** Triggers on install, on browser startup, on a one-off timer about 60 seconds after install (the install-time first navigation is missed on both engines, measured in `SPIKE-M0.md`), and every 6 hours via alarms. One pass over history (not one search per rule), chunked into 7-day windows, newest first, over the last 90 days by default (user-adjustable, `0` meaning all). Per-run budget of 5,000 entries with a persisted cursor so a large backlog resumes on the next alarm instead of blocking. A stale-lock flag prevents overlapping runs. The sweep and the live path call the same matcher.

**Storage.** Rules in browser sync storage as one compact item (8 KB per-item quota is why the 200 cap is hard and why exceeding it must fail loudly). Audit log in local storage as a 500-entry ring buffer, trimmed oldest-first, never synced, clearable. Settings (paused, sweep window, last sweep) in local storage. No telemetry, no network calls, no remote configuration.

**Permissions.** `history`, `storage`, `alarms`, `activeTab`. No host permissions, no content scripts, no `tabs` permission, no network. The popup reads the active tab via `activeTab`; nothing else needs tab access. A context-menu entry was cut because it would require `tabs` or host permissions for a convenience the popup already provides.

**Stack.** extension.js 4.1.36, React 18, TypeScript. UI components from shadcn/ui, icons from lucide. Design tokens follow Hallmark's monochrome direction — `#fdfbf7` surface, `#171717` primary, pastel semantic colours derived to sit on that ground rather than framework defaults. Not load-bearing for correctness: matching and validation are framework-free pure TypeScript, so the UI stack can change without touching the specification, and M0–M3 ship with no styled UI at all.

**UI.** Popup: current URL, "Never keep this site" and "Never keep this subdomain", global pause, link to audit log. No path-rule creation from the popup. Options page: rule list in plain language with per-rule enable/disable and delete, add form with live preview, path rules behind a one-line warning, audit log below. First run shows a three-line statement of the promise and its limits (verbatim copy is a decision, not copywriting to be improved later):

> Histora removes pages from your history after you visit them.
> It cannot stop the visit being recorded for a moment, and it cannot clear recently closed tabs, downloads, or history on other devices.
> Nothing leaves your browser.

**Distribution.** Firefox on AMO plus GitHub Releases; both browsers install from release artifacts; no Chrome Web Store for v1. This forces four constraints: the Firefox artifact must be the AMO-signed file (release-channel Firefox discards unsigned installs, and debug-mode installs vanish on restart), the AMO upload and the release asset must come from the same build, there is no auto-update (so the version string is part of the UI), and checkout-from-source instructions plus checksums are a deliverable. The build is MV3 with no remote code and no host permissions, so the same package can be submitted to the Chrome Web Store later without code changes.

**Support matrix.** Chrome, Edge, Brave, Arc (Chromium, MV3) and Firefox desktop. Safari is unsupported because its extension API has no history access at all; the UI says so rather than shipping a build that cannot work.

## Testing Decisions

**What makes a good test here.** Only external behaviour at a seam: given these rules and this URL, is this visit removed or not. No assertions on internal helpers, no test that would break because a function was renamed, no mocking of browser APIs to assert call order. The filter model is a specification, so its tests are data-driven rows rather than prose assertions.

**Seams.** Two, both pure and browser-free:

1. **Matcher** — `match(rules, url) -> matched rule | null`. This is the single highest seam in the system: the live path, the sweep, the preview, and the audit reason all go through it, so testing it covers the product's entire decision surface. The `PLAN.md` §4.4 match table becomes its fixture table verbatim, and adding a rule kind means adding rows, not writing a new test file.
2. **Rule validation** — `validate(kind, input) -> rule | error`. Covers public-suffix rejection, `www` handling, path normalization, keyword minimum length, and the 200-rule cap. Same pure style, same fixture approach.

The storage codec (compact tuple encoding, round-trip, cap enforcement) is the third, much smaller seam; it is tested because silent rule loss under an 8 KB quota is a real failure class.

**Not unit tested, verified manually instead:** listener wiring, sweep scheduling and cursor resumption, delete fallback on the second URL form, and every browser-API assumption. These are verified against real browsers, because mocking them would only test the mock.

**Prior art.** None — the repository is greenfield (no source, no test suite, not a git repository yet), so this PRD sets the convention: pure modules in the core tested with table-driven fixtures, browser-touching code verified by a scripted manual matrix, no test doubles for browser APIs.

**Manual matrix per browser:** a matched visit disappears from history and from omnibox suggestions within about a second; an unmatched site is untouched; `www.example.com` survives an `example.com` rule (strictness verified deliberately); killing the service worker then visiting still results in removal after wake; disabling the extension, visiting, and re-enabling results in sweep cleanup; pause actually pauses; a 500-entry audit log trims correctly; `file://`, `chrome://`, and incognito are untouched; a clean profile installs from the README alone.

## Out of Scope

- Restoring deleted history; there is no undo, and rule deletion does not resurrect entries.
- Per-visit granularity: deleting a URL removes every visit to it.
- Preventing the initial write, or any "hide without deleting" behaviour.
- Recently closed tabs and session restore, downloads, autofill, form history, other profiles, other devices, DNS and network logs.
- Chrome Web Store listing, auto-update, and store-mediated distribution.
- Safari, and mobile browsers of any kind.
- Incognito, and browser-internal or local-file URLs.
- Matching on page titles (they change after the visit, making removal unpredictable).
- Regex rules, compound rules, and any second condition per rule.
- Telemetry, analytics, crash reporting, and any network request.
- Enterprise fleet policy handling.

## Further Notes

- **The M0 spike comes first and can falsify the plan.** Everything above assumes `onVisited` fires reliably for the navigation types real users produce, and that `deleteUrl` removes the entry it names on both browsers. Half a day of scaffolding tests that. If either assumption fails — notably for single-page-app soft navigations — the sweep window and the onboarding copy change, and the matcher does not.
- **Silent success is the product's main UX risk.** A working extension and a broken one look identical: nothing happens either way. The audit log is therefore a user-facing feature with its own placement (two clicks from the popup), not a debugging aid.
- **Strictness will generate support questions.** "I added example.com and it still shows up" is the expected report, caused by the `www` redirect. The sibling-host suggestion in the preview is the intended answer, and the rule label ("Only the exact host example.com") is the second line of defence.
- **Distribution friction is the accepted weak point.** Asking a general audience to install an unpacked Chrome extension from GitHub is a real cost, accepted to avoid review dependence and the "Read and change all your browsing history" warning at first contact. The Chrome Web Store path stays open because nothing in the build depends on the current channel.
- **Copy is a decision surface, not decoration.** "Removed from history" and the three onboarding lines are fixed by this PRD; loosening them to "private browsing" or "hidden from history" would make the product dishonest and is grounds for rejection in review.
