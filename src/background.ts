import {api} from './history/api'
import {match} from './core/match'
import {ruleLabel} from './core/format'
import {loadRules} from './storage/rules'
import {loadSettings} from './storage/settings'
import {appendAudit} from './storage/audit'
import {deleteHistoryUrl} from './history/delete'
import {runSweep, sweepRuleNow} from './history/sweep'

const SIX_HOURS_MIN = 6 * 60
const POST_INSTALL_MIN = 1

// Every listener is registered at the top level so a suspended worker wakes for it.

/** Alarms live in memory in Firefox and are not persisted by Chrome before 150. */
const schedulePeriodicSweep = (): void => {
  api.alarms.create('sweep-6h', {periodInMinutes: SIX_HOURS_MIN})
}

api.runtime.onInstalled.addListener(() => {
  api.alarms.create('sweep-post-install', {delayInMinutes: POST_INSTALL_MIN})
  schedulePeriodicSweep()
  void runSweep()
})

api.runtime.onStartup?.addListener?.(() => {
  schedulePeriodicSweep()
  void runSweep()
})

api.alarms.onAlarm.addListener((alarm: {name?: string}) => {
  if (typeof alarm?.name === 'string' && alarm.name.startsWith('sweep')) void runSweep()
})

api.history.onVisited.addListener(async (item: {url?: string}) => {
  const url = item?.url

  if (!url) return

  try {
    // Pause covers the live path too, not only the sweep.
    if ((await loadSettings()).paused) return

    const hit = match(await loadRules(), url)

    if (!hit) return

    const outcome = await deleteHistoryUrl(url)

    await appendAudit({
      url,
      ruleId: hit.rule.id,
      ruleLabel: ruleLabel(hit.rule),
      result: outcome.ok ? 'deleted' : 'failed',
      reason: hit.reason,
      error: outcome.ok ? undefined : outcome.error
    })
  } catch (error) {
    await appendAudit({
      url,
      ruleId: 'unknown',
      ruleLabel: 'Could not read the rule list',
      result: 'failed',
      error: String(error)
    })
  }
})

api.runtime.onMessage.addListener(
  (message: {type?: string; ruleId?: string}, _sender: unknown, sendResponse: (value: unknown) => void) => {
    if (message?.type === 'sweep-now') {
      void runSweep().then(sendResponse)

      return true
    }

    if (message?.type === 'sweep-rule' && message.ruleId) {
      void sweepRuleNow(message.ruleId).then(sendResponse)

      return true
    }

    return undefined
  }
)
