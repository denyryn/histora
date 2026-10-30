import {beforeEach, describe, expect, it, vi} from 'vitest'

type Dict = Record<string, unknown>

const makeArea = (data: Dict) => ({
  get: async (key?: string | string[] | null): Promise<Dict> => {
    if (key === undefined || key === null) return {...data}

    const keys = Array.isArray(key) ? key : [key]
    const found: Dict = {}

    for (const entry of keys) if (entry in data) found[entry] = data[entry]

    return found
  },
  set: async (items: Dict) => {
    Object.assign(data, items)
  }
})

type Harness = {
  sync: Dict
  local: Dict
  visited: Array<(item: {url?: string}) => Promise<void>>
  startup: Array<() => void>
  alarms: Array<{name: string; info: {periodInMinutes?: number; delayInMinutes?: number}}>
  deleteUrl: ReturnType<typeof vi.fn>
  alive: Set<string>
}

/**
 * Boots the real background entry against a fake browser, so the wiring
 * (match → delete → audit) is covered without a browser.
 */
const boot = async (
  options: {failDeletes?: boolean; brokenStorage?: boolean} = {}
): Promise<Harness> => {
  const sync: Dict = {}
  const local: Dict = {}
  const alive = new Set<string>()
  const visited: Array<(item: {url?: string}) => Promise<void>> = []
  const startup: Array<() => void> = []
  const alarms: Array<{name: string; info: {periodInMinutes?: number; delayInMinutes?: number}}> = []

  const deleteUrl = vi.fn(async ({url}: {url: string}) => {
    if (options.failDeletes) throw new Error('QuotaExceededError: history is busy')
    alive.delete(url)
  })

  const search = vi.fn(async () => [...alive].map((url) => ({url})))

  const syncArea = makeArea(sync)

  if (options.brokenStorage) {
    syncArea.get = async () => {
      throw new Error('storage unavailable')
    }
  }

  ;(globalThis as any).chrome = {
    runtime: {
      onInstalled: {addListener: () => undefined},
      onStartup: {addListener: (fn: () => void) => startup.push(fn)},
      onMessage: {addListener: () => undefined}
    },
    alarms: {
      create: (name: string, info: {periodInMinutes?: number; delayInMinutes?: number}) =>
        alarms.push({name, info}),
      onAlarm: {addListener: () => undefined}
    },
    history: {
      onVisited: {addListener: (fn: (item: {url?: string}) => Promise<void>) => visited.push(fn)},
      deleteUrl,
      search
    },
    storage: {sync: syncArea, local: makeArea(local)}
  }

  delete (globalThis as any).browser

  await import('../src/background')

  sync.rules = JSON.stringify([[0, 'probe', 1, 1_700_000_000]])

  return {sync, local, visited, startup, alarms, deleteUrl, alive}
}

const auditOf = (local: Dict) => (local.audit ?? []) as Array<Record<string, unknown>>

beforeEach(() => {
  vi.resetModules()
})

describe('background wiring', () => {
  it('deletes a matched visit and audits it with the rule that fired', async () => {
    const harness = await boot()
    harness.alive.add('https://example.com/probe/1')

    await harness.visited[0]({url: 'https://example.com/probe/1'})

    expect(harness.deleteUrl).toHaveBeenCalledTimes(1)
    expect(harness.alive.size).toBe(0)

    const [entry] = auditOf(harness.local)

    expect(entry).toMatchObject({
      url: 'https://example.com/probe/1',
      ruleId: 'keyword:probe',
      result: 'deleted'
    })
    expect(String(entry.ruleLabel)).toContain('probe')
  })

  it('leaves an unmatched visit alone and writes nothing', async () => {
    const harness = await boot()
    harness.alive.add('https://example.com/keep/1')

    await harness.visited[0]({url: 'https://example.com/keep/1'})

    expect(harness.deleteUrl).not.toHaveBeenCalled()
    expect(auditOf(harness.local)).toHaveLength(0)
  })

  it('records a failure instead of swallowing it, and leaves the entry for the sweep', async () => {
    const harness = await boot({failDeletes: true})
    harness.alive.add('https://example.com/probe/1')

    await harness.visited[0]({url: 'https://example.com/probe/1'})

    const [entry] = auditOf(harness.local)

    expect(entry).toMatchObject({result: 'failed', ruleId: 'keyword:probe'})
    expect(String(entry.error)).toContain('QuotaExceededError')
    expect(harness.alive.has('https://example.com/probe/1')).toBe(true)
  })

  it('records a failure when the rule list cannot be read', async () => {
    const harness = await boot({brokenStorage: true})

    await harness.visited[0]({url: 'https://example.com/probe/1'})

    const [entry] = auditOf(harness.local)

    expect(entry).toMatchObject({result: 'failed', ruleId: 'unknown'})
    expect(String(entry.error)).toContain('storage unavailable')
  })

  it('does not delete a matched visit while removal is paused', async () => {
    const harness = await boot()

    harness.local.settings = {paused: true, sweepWindowDays: 90, shownOnboarding: false}
    harness.alive.add('https://example.com/probe/1')

    await harness.visited[0]({url: 'https://example.com/probe/1'})

    expect(harness.deleteUrl).not.toHaveBeenCalled()
    expect(auditOf(harness.local)).toHaveLength(0)
  })

  it('recreates the periodic sweep alarm on startup', async () => {
    const harness = await boot()

    harness.startup[0]()

    expect(harness.alarms).toContainEqual({
      name: 'sweep-6h',
      info: {periodInMinutes: 360}
    })
  })

  it('trims the audit log to the newest 500 entries', async () => {
    const harness = await boot()

    harness.local.audit = Array.from({length: 500}, (_, index) => ({
      t: 1_700_000_000_000 + index,
      url: `https://filler.test/${index}`,
      ruleId: 'keyword:filler',
      ruleLabel: 'filler',
      result: 'deleted'
    }))

    harness.alive.add('https://example.com/probe/1')
    await harness.visited[0]({url: 'https://example.com/probe/1'})

    const audit = auditOf(harness.local)

    expect(audit).toHaveLength(500)
    expect(audit[0].url).toBe('https://example.com/probe/1')
  })
})
