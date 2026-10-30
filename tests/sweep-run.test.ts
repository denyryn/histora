import {beforeEach, describe, expect, it, vi} from 'vitest'

type Dict = Record<string, unknown>
type Row = {url: string; lastVisitTime: number}

const makeArea = (data: Dict) => ({
  get: async (key?: string | null): Promise<Dict> => {
    if (key === undefined || key === null) return {...data}

    return key in data ? {[key]: data[key]} : {}
  },
  set: async (items: Dict) => {
    Object.assign(data, items)
  }
})

const DAY = 86_400_000
const NOW = Date.now()

const fixture = (): Row[] => [
  {url: 'https://example.com/probe/1', lastVisitTime: NOW - 1 * DAY},
  {url: 'https://example.com/probe/2', lastVisitTime: NOW - 2 * DAY},
  {url: 'https://example.com/probe/3', lastVisitTime: NOW - 10 * DAY},
  {url: 'https://example.com/probe/4', lastVisitTime: NOW - 20 * DAY}
]

const boot = async (settings: Dict = {}) => {
  const sync: Dict = {
    rules: JSON.stringify([[1, 'example.com', 1, 1_700_000_000]])
  }
  const local: Dict = {
    settings: {
      paused: false,
      sweepWindowDays: 30,
      lastSweepAt: null,
      cursorStart: null,
      lockAt: null,
      ...settings
    }
  }
  const remaining = new Map(fixture().map((row) => [row.url, row.lastVisitTime]))
  const deletions: string[] = []

  const search = vi.fn(async ({startTime, endTime}: {startTime: number; endTime: number}) =>
    [...remaining].filter(([, at]) => at >= startTime && at <= endTime).map(([url, at]) => ({
      url,
      lastVisitTime: at
    }))
  )

  const deleteUrl = vi.fn(async ({url}: {url: string}) => {
    deletions.push(url)
    remaining.delete(url)
  })

  ;(globalThis as any).chrome = {
    history: {search, deleteUrl},
    storage: {sync: makeArea(sync), local: makeArea(local)}
  }
  delete (globalThis as any).browser
  vi.resetModules()

  const {runSweep} = await import('../src/history/sweep')

  return {runSweep, local, sync, deletions, remaining}
}

beforeEach(() => {
  vi.resetModules()
})

describe('runSweep', () => {
  it('walks newest first and deletes matched entries', async () => {
    const harness = await boot()

    const result = await harness.runSweep({budget: 100})

    expect(result).toMatchObject({processed: 4, deleted: 4, failed: 0, stopped: false})
    expect(harness.deletions).toHaveLength(4)
    expect((harness.local.settings as Dict).cursorStart).toBeNull()
    expect(harness.local.audit as unknown[]).toHaveLength(4)
  })

  it('stops at the budget, saves a cursor, and resumes without redoing work', async () => {
    const harness = await boot()

    const first = await harness.runSweep({budget: 2})
    const stoppedAt = (harness.local.settings as Dict).cursorStart as number

    expect(first).toMatchObject({processed: 2, deleted: 2, stopped: true})
    expect(stoppedAt).toBe(NOW - 2 * DAY)
    expect(harness.deletions).toEqual([
      'https://example.com/probe/1',
      'https://example.com/probe/2'
    ])

    const second = await harness.runSweep({budget: 100})

    expect(second).toMatchObject({processed: 2, deleted: 2, stopped: false})
    expect((harness.local.settings as Dict).cursorStart).toBeNull()
    expect(new Set(harness.deletions).size).toBe(harness.deletions.length)
    expect(harness.deletions).toEqual([
      'https://example.com/probe/1',
      'https://example.com/probe/2',
      'https://example.com/probe/3',
      'https://example.com/probe/4'
    ])
  })

  it('does nothing while paused', async () => {
    const harness = await boot({paused: true})

    expect(await harness.runSweep()).toMatchObject({skipped: 'paused', processed: 0})
    expect(harness.deletions).toHaveLength(0)
  })

  it('refuses to overlap a fresh run', async () => {
    const harness = await boot({lockAt: Date.now() - 1000})

    expect(await harness.runSweep()).toMatchObject({skipped: 'locked'})
    expect(harness.deletions).toHaveLength(0)
  })

  it('takes over a stale lock', async () => {
    const harness = await boot({lockAt: Date.now() - 10 * 60 * 1000})

    const result = await harness.runSweep()

    expect(result.processed).toBe(4)
    expect(result.skipped).toBeUndefined()
    expect((harness.local.settings as Dict).lockAt).toBeNull()
  })

  it('limits a rule confirmation to that rule', async () => {
    const harness = await boot()

    harness.sync.rules = JSON.stringify([
      [1, 'example.com', 1, 1_700_000_000],
      [1, 'other.test', 1, 1_700_000_000]
    ])

    const result = await harness.runSweep({onlyRuleId: 'domain:other.test', budget: 100})

    expect(result.processed).toBe(4)
    expect(harness.deletions).toHaveLength(0)
  })
})
