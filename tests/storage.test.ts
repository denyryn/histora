import {describe, expect, it} from 'vitest'
import {assertWithinBudget, decodeRules, encodeRules, SYNC_BUDGET_BYTES} from '../src/storage/rules'
import type {Rule} from '../src/core/match'

const rule = (kind: Rule['kind'], value: string, enabled = true): Rule => ({
  id: `${kind}:${value}`,
  kind,
  value,
  enabled,
  createdAt: 1_700_000_000_000
})

describe('rule storage codec', () => {
  it('round-trips every kind, flag, and timestamp', () => {
    const rules = [
      rule('keyword', 'porn'),
      rule('domain', 'example.com'),
      rule('subdomain', 'www.example.com', false),
      rule('slug', '/blog/Secret')
    ]

    const decoded = decodeRules(encodeRules(rules))

    expect(decoded).toHaveLength(4)
    expect(decoded.map((entry) => [entry.kind, entry.value, entry.enabled])).toEqual([
      ['keyword', 'porn', true],
      ['domain', 'example.com', true],
      ['subdomain', 'www.example.com', false],
      ['slug', '/blog/Secret', true]
    ])
  })

  it('restores the same deterministic id, so audit entries keep their target', () => {
    const [original] = [rule('domain', 'example.com')]

    expect(decodeRules(encodeRules([original]))[0].id).toBe(original.id)
  })

  it('keeps createdAt to the second', () => {
    const decoded = decodeRules(encodeRules([rule('keyword', 'porn')]))

    expect(decoded[0].createdAt).toBe(1_700_000_000_000)
  })

  it('returns an empty list for missing, junk, or truncated data', () => {
    expect(decodeRules(undefined)).toEqual([])
    expect(decodeRules('')).toEqual([])
    expect(decodeRules('not json')).toEqual([])
    expect(decodeRules('{"a":1}')).toEqual([])
  })

  it('skips malformed rows instead of failing the whole list', () => {
    const encoded = JSON.stringify([
      [1, 'example.com', 1, 1_700_000_000],
      [99, 'unknown-kind', 1, 1_700_000_000],
      [1, '', 1, 1_700_000_000],
      'nope',
      [2, 'www.example.com', 0, 1_700_000_000]
    ])

    expect(decodeRules(encoded).map((entry) => entry.value)).toEqual([
      'example.com',
      'www.example.com'
    ])
  })

  it('fits 200 short rules inside the sync budget', () => {
    const short = Array.from({length: 200}, (_, index) => rule('slug', `/p/${index}`))
    const encoded = encodeRules(short)

    expect(() => assertWithinBudget(encoded)).not.toThrow()
    expect(encoded.length).toBeLessThan(SYNC_BUDGET_BYTES)
  })

  it('refuses long values rather than silently losing rules', () => {
    const long = Array.from({length: 200}, (_, index) =>
      rule('slug', `/a/reasonably-long-path-number-${index}/page`)
    )

    expect(() => assertWithinBudget(encodeRules(long))).toThrow(/allows/)
  })

  it('measures the budget in UTF-8 bytes, not UTF-16 units', () => {
    // 2,400 CJK characters: under 7,000 `.length`, over 7,000 UTF-8 bytes.
    const wide = '日'.repeat(2400)

    expect(wide.length).toBeLessThan(SYNC_BUDGET_BYTES)
    expect(() => assertWithinBudget(wide)).toThrow(/bytes/)
  })
})
