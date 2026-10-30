import {historyApi} from './api'
import {match} from '../core/match'
import {ruleLabel} from '../core/format'
import {loadRules} from '../storage/rules'
import {appendAudit} from '../storage/audit'
import {loadSettings, saveSettings} from '../storage/settings'
import {deleteHistoryUrl} from './delete'

const DAY = 86_400_000

export const CHUNK_DAYS = 7
export const DEFAULT_BUDGET = 5000
export const RULE_BUDGET = 2000
export const LOCK_STALE_MS = 5 * 60 * 1000

export type Window = {start: number; end: number}

/**
 * Fixed-size windows, newest first, so a run can stop anywhere and resume
 * without re-reading years of history in one go.
 */
export function windowsFrom(now: number, windowDays: number, chunkDays = CHUNK_DAYS): Window[] {
  const floor = windowDays > 0 ? Math.max(0, now - windowDays * DAY) : 0
  const windows: Window[] = []

  let end = now

  while (end > floor) {
    const start = Math.max(floor, end - chunkDays * DAY)

    windows.push({start, end})
    end = start
  }

  return windows
}

export type SweepResult = {
  processed: number
  deleted: number
  failed: number
  stopped: boolean
  skipped?: 'paused' | 'locked'
}

/** A stopped run resumes at the window it stopped in, never after it. */
export function resumeFrom(windows: Window[], cursor: number | null): Window[] {
  return cursor === null ? windows : windows.filter((window) => window.start <= cursor)
}

const EMPTY: SweepResult = {processed: 0, deleted: 0, failed: 0, stopped: false}

/**
 * One pass over history. Rules are evaluated in memory; the budget bounds the
 * run so the MV3 worker is never killed mid-sweep, and the cursor makes the
 * next run resume where this one stopped.
 */
export async function runSweep(
  options: {budget?: number; onlyRuleId?: string} = {}
): Promise<SweepResult> {
  const budget = options.budget ?? DEFAULT_BUDGET
  const settings = await loadSettings()
  const now = Date.now()

  if (settings.paused) return {...EMPTY, skipped: 'paused'}

  if (settings.lockAt && now - settings.lockAt < LOCK_STALE_MS) {
    return {...EMPTY, skipped: 'locked'}
  }

  const rules = (await loadRules()).filter(
    (rule) => rule.enabled && (!options.onlyRuleId || rule.id === options.onlyRuleId)
  )

  if (rules.length === 0) {
    await saveSettings({lastSweepAt: now})

    return EMPTY
  }

  await saveSettings({lockAt: now})

  let processed = 0
  let deleted = 0
  let failed = 0
  let stopped = false
  let cursor: number | null = null
  let lastDone: number | null = null

  try {
    const all = windowsFrom(now, settings.sweepWindowDays)
    const windows = resumeFrom(all, settings.cursorStart)

    outer: for (const window of windows) {
      const rows: Array<{url: string; lastVisitTime?: number}> = (
        await historyApi().search({
          text: '',
          startTime: window.start,
          endTime: window.end,
          maxResults: 5000
        })
      ).sort(
        (left: {lastVisitTime?: number}, right: {lastVisitTime?: number}) =>
          (right.lastVisitTime ?? 0) - (left.lastVisitTime ?? 0)
      )

      for (const row of rows) {
        const visitedAt = row.lastVisitTime ?? 0

        // Already handled by the run that stopped here.
        if (settings.cursorStart !== null && visitedAt > settings.cursorStart) continue

        if (processed >= budget) {
          // Resume at the last entry handled, so a window larger than the
          // budget still makes progress instead of looping forever.
          cursor = lastDone ?? window.start
          stopped = true
          break outer
        }

        processed += 1
        lastDone = visitedAt || lastDone

        const hit = match(rules, row.url)

        if (!hit) continue

        const outcome = await deleteHistoryUrl(row.url)

        if (outcome.ok) deleted += 1
        else failed += 1

        await appendAudit({
          url: row.url,
          ruleId: hit.rule.id,
          ruleLabel: ruleLabel(hit.rule),
          result: outcome.ok ? 'deleted' : 'failed',
          reason: hit.reason,
          error: outcome.ok ? undefined : outcome.error
        })
      }
    }
  } finally {
    await saveSettings({lastSweepAt: now, cursorStart: cursor, lockAt: null})
  }

  return {processed, deleted, failed, stopped}
}

/** Bounded pass for one rule, used when a rule is confirmed in the UI. */
export function sweepRuleNow(ruleId: string): Promise<SweepResult> {
  return runSweep({onlyRuleId: ruleId, budget: RULE_BUDGET})
}
