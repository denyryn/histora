# SPIKE-M0 — browser API probe

Date: 2026-10-31. Scope: the eight M0 tasks in `TODO.md`. Verdict: **the plan's deletion model holds on both browsers; one trigger needs adding.**

Environment: extension.js 4.1.36, React template stripped to a background-only MV3 build, Node 26.8.1. Chrome pass on Playwright's Chromium 156 with `--load-extension`; Firefox pass on Firefox 151 via `web-ext run` (temporary add-on, MV3 event page). The probe extension reports every observed event to a local recorder on `127.0.0.1:8899`; that recorder also serves the navigation sequence.

Sequence driven per browser: `/start` → `/a` → `/b?utm=1` → `/spa` (pushState to `/spa/route1` 1.2 s later) → `/redirect` (302 → `/target`) → `/target` → `/done`. Chrome ran the sequence twice, with a 70 s idle gap before the second pass.

## Answers

| # | Question | Chrome 156 | Firefox 151 | Consequence |
|---|---|---|---|---|
| 1 | Does `onVisited` fire for a normal top-level navigation? | Yes, query string preserved (`/b?utm=1`) | Yes | The live path in `PLAN.md` §5.1 is viable as written. |
| 2 | Does `deleteUrl` remove the entry it names? | Yes, 8 of 8 events; `remaining=0` | Yes, 7 of 7 events; `remaining=0` | Post-hoc delete works. |
| 3 | How fast, from event to verified gone? | 3–15 ms | 16–90 ms (first call 90 ms, then 16–31 ms) | Both far inside the "about a second" promise. Firefox's first call is the cold one. |
| 4 | Does a `pushState` route change produce `onVisited`? | Yes, `/spa/route1` | Yes, `/spa/route1` | SPA soft navigations are covered on both. No `webNavigation` fallback needed; the PRD's matcher-only listener is enough. |
| 5 | Are redirect hops separate entries? | Yes — `/redirect` and `/target` both fired, both deleted | Yes — same | `PLAN.md` §5.1 "each hop matched independently" is correct, and both hops need deletion. |
| 6 | Is the first navigation after install caught? | **No** — `/start` survived pass 1, and the dump shows it as the only entry left | **No** — same | Real gap. The listener is registered after the first page loads, so the install-time visit is never seen. |
| 7 | Does the raw URL string suffice for `deleteUrl`? | Yes, every time; the normalized-`href` fallback never ran | Yes, every time | Keep the fallback, but it is now *unverified* rather than known-good. |
| 8 | Can MV3 worker eviction be observed this way? | **Inconclusive** — Playwright's debugger handle kept the worker listed (`service workers after idle = 1`) | Not applicable (Firefox MV3 uses an event page via `background.scripts`) | Needs a different method (see below). |

Supporting evidence: alarms fired on both; the Firefox MV3 `background.scripts` event page works, so no service-worker variant is required for Gecko; the end-of-run history dump on Chrome's second pass was empty, meaning the full sequence was removed including the repeated `/start`.

## What changes

1. **Sweep trigger: add a one-off run shortly after install.** The install-time first navigation is missed on both browsers, and the 6-hour alarm leaves it visible for hours. `PLAN.md` §5.2 gains a `~60 s after install` trigger; this is not a new mechanism, just a trigger, and it reuses the existing sweep.
2. **No SPA fallback work.** `webNavigation`/`tabs` listeners stay out of scope — `onVisited` already covers `pushState` on both engines.
3. **The normalized-`href` deletion fallback is defence, not tested behaviour.** M2 keeps it and must record which form actually matched in the audit log, so a future field report can say whether the fallback ever runs.
4. **Worker-eviction testing needs a debugger-free method.** Proposed for M2: run the built extension under a plain Chrome profile, wait past the 30 s idle timeout, confirm the worker is gone via `chrome://serviceworker-internals`, then visit a matched page and check the audit log. Do not use Playwright for that step, because attaching keeps the worker alive.

   **Resolved in M2.** The method that works: launch Chromium directly with `--remote-debugging-port` and never attach to the worker target. Poll `/json/list` and match the entry whose URL ends in `/background/service_worker.js` (the browser ships two other extension workers, so a bare `type === 'service_worker'` picks the wrong one). Seed the rule through one short-lived `Runtime.evaluate` session, close it, and the target disappears after the idle timeout. On the next navigation the worker is recreated and the audit entry is written. Result: worker absent → visit → worker restarted → entry deleted and audited. Playwright's `serviceWorkers()` handle is what kept it alive, not the extension.

## What does not change

The four rule kinds, the match table, the audit log, the deletion order, the 90-day sweep window, the 200-rule cap, and the onboarding copy. Nothing in §4 was exercised by this probe and nothing in §4 needed to be.

## Follow-ups (not blockers)

- Does a `pushState` URL actually enter history, or was it never recorded? Both probes deleted immediately, so they cannot distinguish "recorded then deleted" from "never recorded". Either way nothing leaks, so this is curiosity, not risk — but it decides whether the sweep should expect such rows at all.
- Chromium 156 creates no history visit for a response that is not 2xx, so `onVisited` never fires for a 404 page. Any local test server must answer 200 or the extension looks broken; this cost an hour in M2 before the profile's `History` SQLite file showed the difference.
- Whether branded Chrome 155 still accepts a manual load-unpacked install from the release zip is an M6 install-path check, not an API question.

## Artifacts (throwaway)

- `/tmp/opencode/spike` — the probe extension (background-only build for Chrome and Firefox)
- `/tmp/opencode/probe-server.mjs` — recorder and navigation sequence
- `/tmp/opencode/run-chrome.mjs` — Playwright runner, two passes with a 70 s idle gap
- `/tmp/opencode/probe-log-chrome.jsonl`, `/tmp/opencode/probe-log.jsonl` (Firefox run) — raw event logs

None of this is product code; it exists to answer the eight questions above and can be deleted.
