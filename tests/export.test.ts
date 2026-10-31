import {describe, expect, it} from 'vitest'
import type {Rule} from '../src/core/match'
import {RULES_FILE_VERSION, rulesFile, rulesFileName} from '../src/rules/export'

const rule = (kind: Rule['kind'], value: string, enabled = true): Rule => ({
  id: `${kind}:${value}`,
  kind,
  value,
  enabled,
  createdAt: 1760000000000
})

const at = new Date(2026, 9, 31, 12, 0, 0)

describe('rulesFileName', () => {
  it('names the file after the local day', () => {
    expect(rulesFileName(at)).toBe('histora-rules-2026-10-31.json')
  })

  it('zero-pads single-digit months and days', () => {
    expect(rulesFileName(new Date(2026, 0, 5, 9, 0, 0))).toBe('histora-rules-2026-01-05.json')
  })
})

describe('rulesFile', () => {
  it('writes a readable JSON file with a trailing newline', () => {
    const text = rulesFile([rule('domain', 'example.com')], at)

    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual({
      version: RULES_FILE_VERSION,
      exportedAt: at.toISOString(),
      rules: [{kind: 'domain', value: 'example.com', enabled: true}]
    })
  })

  it('keeps disabled rules and the list order', () => {
    const text = rulesFile(
      [rule('slug', '/probe/3'), rule('keyword', 'zz9', false), rule('subdomain', 'www.example.com')],
      at
    )

    expect(JSON.parse(text).rules).toEqual([
      {kind: 'slug', value: '/probe/3', enabled: true},
      {kind: 'keyword', value: 'zz9', enabled: false},
      {kind: 'subdomain', value: 'www.example.com', enabled: true}
    ])
  })

  it('leaves internal fields out', () => {
    const [exported] = JSON.parse(rulesFile([rule('domain', 'example.com')], at)).rules

    expect(Object.keys(exported).sort()).toEqual(['enabled', 'kind', 'value'])
  })

  it('exports an empty list rather than failing', () => {
    expect(JSON.parse(rulesFile([], at)).rules).toEqual([])
  })
})
