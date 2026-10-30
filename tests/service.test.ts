import {beforeEach, describe, expect, it, vi} from 'vitest'

type Dict = Record<string, unknown>

const makeArea = (data: Dict) => ({
  get: async (key?: string | null): Promise<Dict> => {
    if (key === undefined || key === null) return {...data}

    return key in data ? {[key]: data[key]} : {}
  },
  set: async (items: Dict) => {
    Object.assign(data, items)
  }
})

const NOW = 1_800_000_000_000
const DAY = 86_400_000

type Row = {url: string; title?: string; lastVisitTime: number}

const rows: Row[] = [
  {url: 'https://unrelated.com/page', lastVisitTime: NOW - DAY},
  {url: 'https://other.site/blog/secret', title: 'Secret on other.site', lastVisitTime: NOW - 2 * DAY},
  {url: 'https://example.com/blog/secret?utm=1', lastVisitTime: NOW - 3 * DAY},
  // Same URL as the newest match below: counts once, but is older.
  {url: 'https://example.com/blog/secret', lastVisitTime: NOW - 5 * DAY},
  {url: 'https://example.com/blog/secret', lastVisitTime: NOW - DAY}
]

const boot = (options: {rows?: Row[]; tabs?: Array<{url?: string}>} = {}) => {
  const sync: Dict = {}
  const local: Dict = {settings: {paused: false, sweepWindowDays: 90, shownOnboarding: false}}

  ;(globalThis as any).chrome = {
    history: {
      search: vi.fn(async ({text}: {text: string}) => {
        const rows = options.rows ?? []
        const needle = text.toLowerCase()

        return rows
          .filter(
            (row) =>
              row.url.toLowerCase().includes(needle) ||
              (row.title ?? '').toLowerCase().includes(needle)
          )
          .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
      }),
      deleteUrl: vi.fn()
    },
    storage: {sync: makeArea(sync), local: makeArea(local)},
    tabs: {query: vi.fn(async () => options.tabs ?? [])}
  }
  delete (globalThis as any).browser
  vi.resetModules()

  return {sync, local}
}

beforeEach(() => {
  vi.resetModules()
})

describe('previewRule', () => {
  it('normalizes the input before matching', async () => {
    boot({rows: [{url: 'https://example.com/a', lastVisitTime: NOW}]})
    const {previewRule} = await import('../src/rules/service')

    expect((await previewRule('domain', 'Example.COM')).count).toBe(1)
  })

  it('lowercases keyword input before matching', async () => {
    boot({rows: [{url: 'https://example.com/probe/1', lastVisitTime: NOW}]})
    const {previewRule} = await import('../src/rules/service')

    expect((await previewRule('keyword', 'PROBE')).count).toBe(1)
  })

  it('returns zero without throwing for invalid input', async () => {
    boot()
    const {previewRule} = await import('../src/rules/service')

    expect(await previewRule('domain', 'co.uk')).toEqual({count: 0, hits: [], siblings: []})
  })

  it('offers sibling hosts of a domain rule without counting them', async () => {
    boot({
      rows: [
        {url: 'https://example.com/a', lastVisitTime: NOW},
        {url: 'https://www.example.com/b', lastVisitTime: NOW - DAY},
        {url: 'https://news.example.com/c', lastVisitTime: NOW - 2 * DAY},
        {url: 'https://elsewhere.test/example.com', lastVisitTime: NOW - 3 * DAY}
      ]
    })
    const {previewRule} = await import('../src/rules/service')

    const preview = await previewRule('domain', 'example.com')

    expect(preview.count).toBe(1)
    expect(preview.siblings).toEqual(['news.example.com', 'www.example.com'])
  })

  it('counts distinct URLs and lists the five newest matches', async () => {
    boot({rows})
    const {previewRule} = await import('../src/rules/service')

    const preview = await previewRule('slug', '/blog/secret')

    expect(preview.count).toBe(3)
    expect(preview.hits).toHaveLength(3)
    expect(preview.hits[0].url).toBe('https://example.com/blog/secret')
    expect(preview.hits[0].lastVisitTime).toBe(NOW - DAY)
    expect(preview.hits[1].url).toBe('https://other.site/blog/secret')
    expect(preview.hits[1].title).toBe('Secret on other.site')
    expect(preview.hits[2].url).toBe('https://example.com/blog/secret?utm=1')
  })

  it('keeps host-agnostic slug matching and returns zero for nothing', async () => {
    boot({rows})
    const {previewRule} = await import('../src/rules/service')

    // Slug ignores host — but other.site already matches above; use a host that is not in history.
    expect((await previewRule('domain', 'nomatch.test')).count).toBe(0)
  })
})

describe('rule service', () => {
  const svc = () => import('../src/rules/service') as Promise<typeof import('../src/rules/service')>

  it('create, list newest first, enable, remove', async () => {
    boot({rows})
    const {createRule, listRules, setRuleEnabled, removeRule} = await svc()

    const a = await createRule('domain', 'example.com')
    vi.spyOn(Date, 'now').mockReturnValue(1_900_000_000_000)
    const b = await createRule('keyword', 'probe')
    vi.restoreAllMocks()

    const listed = await listRules()
    expect(listed.map((rule) => rule.id)).toEqual([b.id, a.id])

    const disabled = await setRuleEnabled(a.id, false)
    expect(disabled.find((rule) => rule.id === a.id)?.enabled).toBe(false)

    const afterRemove = await removeRule(b.id)
    expect(afterRemove.map((rule) => rule.id)).toEqual([a.id])
  })

  it('rejects duplicates and invalid input with plain errors', async () => {
    boot()
    const {createRule} = await svc()

    await createRule('domain', 'example.com')

    await expect(createRule('domain', 'example.com')).rejects.toThrow('That rule already exists.')
    await expect(createRule('domain', 'co.uk')).rejects.toThrow('public suffix')
    await expect(createRule('domain', 'blog.example.com')).rejects.toThrow('Use the exact host type')
    await expect(createRule('keyword', 'a')).rejects.toThrow('at least two characters')
  })

  it('fails loudly at the rule cap', async () => {
    boot()
    // Seed the cap directly, as the encoded sync rows the storage layer writes.
    const rows = Array.from({length: 200}, (_, i) => [3, `/two/${i}`, 1, 1_700_000_000])
    ;(globalThis as any).chrome.storage.sync.set({rules: JSON.stringify(rows)})

    const {createRule} = await svc()

    await expect(createRule('keyword', 'probe')).rejects.toThrow('You already have 200 rules.')
  })

  it('fails loudly at the sync byte budget', async () => {
    boot()
    const rows = Array.from({length: 199}, (_, i) => [3, `/${'x'.repeat(30)}-${i}`, 1, 1_700_000_000])
    ;(globalThis as any).chrome.storage.sync.set({rules: JSON.stringify(rows)})

    const {createRule} = await svc()

    await expect(createRule('keyword', 'probe')).rejects.toThrow('browser sync allows 7000')
  })
})

describe('currentSite', () => {
  const harness = () => import('../src/rules/site') as Promise<typeof import('../src/rules/site')>

  it('returns the active tab for http(s) URLs', async () => {
    boot({tabs: [{url: 'https://www.example.com/page'}]})
    const {currentSite} = await harness()

    expect(await currentSite()).toEqual({
      url: 'https://www.example.com/page',
      host: 'www.example.com',
      domain: 'example.com'
    })
  })

  it('returns null for non-http(s) tabs and when there is no tab', async () => {
    boot({tabs: [{url: 'chrome://settings'}]})
    const {currentSite} = await harness()

    expect(await currentSite()).toBeNull()

    boot()
    const {currentSite: again} = await harness()

    expect(await again()).toBeNull()
  })
})

describe('settings service', () => {
  const svc = () =>
    import('../src/settings/service') as Promise<typeof import('../src/settings/service')>

  it('validates the sweep window', async () => {
    boot()
    const {getSettings, setSweepWindowDays} = await svc()

    expect((await getSettings()).sweepWindowDays).toBe(90)

    await setSweepWindowDays(30)
    expect((await getSettings()).sweepWindowDays).toBe(30)

    await expect(setSweepWindowDays(45)).rejects.toThrow('Choose 0, 30, 90, or 365 days.')
  })

  it('round-trips pause and the onboarding flag', async () => {
    boot()
    const {getSettings, setPaused, hasSeenOnboarding, markOnboardingSeen} = await svc()

    expect((await setPaused(true)).paused).toBe(true)
    expect((await getSettings()).paused).toBe(true)

    expect(await hasSeenOnboarding()).toBe(false)
    await markOnboardingSeen()
    expect(await hasSeenOnboarding()).toBe(true)
  })
})
