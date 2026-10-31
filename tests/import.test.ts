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

const NOW = 1760000000000

const boot = (stored: unknown[] = []) => {
  const sync: Dict = {rules: JSON.stringify(stored)}
  const sendMessage = vi.fn(async () => ({deleted: 0}))

  ;(globalThis as any).chrome = {
    storage: {sync: makeArea(sync), local: makeArea({})},
    runtime: {sendMessage}
  }
  delete (globalThis as any).browser
  vi.resetModules()

  return {sync, sendMessage}
}

const file = (rules: unknown[]) => JSON.stringify({version: 1, exportedAt: new Date(NOW).toISOString(), rules})
const saved = (sync: Dict) => JSON.parse(sync.rules as string) as unknown[][]

beforeEach(() => {
  vi.resetModules()
})

describe('importRules', () => {
  it('adds exported rules, normalized, with their enabled state', async () => {
    const {sync, sendMessage} = boot()
    const {importRules} = await import('../src/rules/import')

    const result = await importRules(
      file([
        {kind: 'domain', value: 'Example.COM', enabled: true},
        {kind: 'keyword', value: 'zz9', enabled: false}
      ]),
      NOW
    )

    expect(result).toMatchObject({added: 2, skipped: 0, rejected: 0, full: false})
    expect(result.rules.map((rule) => [rule.kind, rule.value, rule.enabled])).toEqual([
      ['domain', 'example.com', true],
      ['keyword', 'zz9', false]
    ])
    expect(saved(sync)).toHaveLength(2)
    expect(sendMessage).toHaveBeenCalledWith({type: 'sweep-now'})
  })

  it('keeps existing rules and counts duplicates as skipped', async () => {
    const {sync} = boot([[1, 'example.com', 1, 1750000000]])
    const {importRules} = await import('../src/rules/import')

    const result = await importRules(
      file([
        {kind: 'domain', value: 'example.com', enabled: false},
        {kind: 'slug', value: '/probe/3'}
      ]),
      NOW
    )

    expect(result).toMatchObject({added: 1, skipped: 1, rejected: 0})
    expect(saved(sync)).toHaveLength(2)
    // The stored duplicate keeps its own enabled state.
    expect(saved(sync).find((row) => row[1] === 'example.com')?.[2]).toBe(1)
  })

  it('imports the valid entries and counts the rest', async () => {
    const {sync} = boot()
    const {importRules} = await import('../src/rules/import')

    const result = await importRules(
      file([
        {kind: 'domain', value: 'example.com'},
        {kind: 'nonsense', value: 'x'},
        {kind: 'keyword', value: 'has space'},
        {kind: 'slug', value: '/probe/3'}
      ]),
      NOW
    )

    expect(result).toMatchObject({added: 2, skipped: 0, rejected: 2})
    expect(saved(sync)).toHaveLength(2)
  })

  it('treats a missing enabled flag as enabled', async () => {
    boot()
    const {importRules} = await import('../src/rules/import')

    const result = await importRules(file([{kind: 'domain', value: 'example.com'}]), NOW)

    expect(result.rules[0].enabled).toBe(true)
  })

  it('rejects files that are not a rules export', async () => {
    boot()
    const {importRules} = await import('../src/rules/import')

    await expect(importRules('not json')).rejects.toThrow('That file is not valid JSON.')
    await expect(importRules('{"version":1}')).rejects.toThrow('not a Histora rules export')
    await expect(importRules(file([]))).rejects.toThrow('no rules to import')
  })

  it('stops at the rule cap and reports it', async () => {
    const full = Array.from({length: 199}, (_, index) => [0, `r${index}`, 1, 1750000000])
    const {sync} = boot(full)
    const {importRules} = await import('../src/rules/import')

    const result = await importRules(
      file([
        {kind: 'domain', value: 'one.example'},
        {kind: 'domain', value: 'two.example'}
      ]),
      NOW
    )

    expect(result).toMatchObject({added: 1, full: true})
    expect(saved(sync)).toHaveLength(200)
  })

  it('does not save or sweep when nothing was added', async () => {
    const {sync, sendMessage} = boot([[1, 'example.com', 1, 1750000000]])
    const before = sync.rules
    const {importRules} = await import('../src/rules/import')

    const result = await importRules(file([{kind: 'domain', value: 'example.com'}]), NOW)

    expect(result).toMatchObject({added: 0, skipped: 1})
    expect(sync.rules).toBe(before)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('survives a worker that does not answer the sweep', async () => {
    const {sendMessage} = boot()
    sendMessage.mockRejectedValueOnce(new Error('Could not establish connection.'))
    const {importRules} = await import('../src/rules/import')

    await expect(importRules(file([{kind: 'domain', value: 'example.com'}]), NOW)).resolves.toMatchObject({
      added: 1
    })
  })
})
