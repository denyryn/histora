import {describe, expect, it} from 'vitest'
import {
  addRule,
  MAX_RULES,
  removeRule,
  setRuleEnabled,
  validateRule,
  type RuleInput
} from '../src/core/rules'
import type {Rule} from '../src/core/match'

const value = (kind: RuleInput['kind'], input: string) => {
  const result = validateRule({kind, value: input})

  return result.ok ? result.value : `error: ${result.error}`
}

describe('validateRule', () => {
  it('rejects a bare public suffix', () => {
    expect(value('domain', 'co.uk')).toContain('error:')
    expect(value('domain', 'com')).toContain('error:')
  })

  it('rejects a host under a public suffix in the domain kind and names the fix', () => {
    const result = validateRule({kind: 'domain', value: 'blog.example.co.uk'})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('example.co.uk')
  })

  it('rejects a subdomain in the domain kind', () => {
    const result = validateRule({kind: 'domain', value: 'blog.example.com'})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('exact host')
  })

  it('accepts a full URL pasted into the domain kind', () => {
    expect(value('domain', 'https://Example.com/blog/secret')).toBe('example.com')
  })

  it('accepts any host in the subdomain kind', () => {
    expect(value('subdomain', 'www.example.com')).toBe('www.example.com')
    expect(value('subdomain', 'example.com')).toBe('example.com')
  })

  it('rejects a keyword shorter than two characters or containing spaces', () => {
    expect(validateRule({kind: 'keyword', value: 'a'}).ok).toBe(false)
    expect(validateRule({kind: 'keyword', value: 'a b'}).ok).toBe(false)
  })

  it('lowercases a keyword', () => {
    expect(value('keyword', 'Porn')).toBe('porn')
  })

  it('normalizes a path to a leading slash and no trailing slash', () => {
    expect(value('slug', 'blog/secret/')).toBe('/blog/secret')
  })

  it('rejects a path containing a query or fragment', () => {
    expect(validateRule({kind: 'slug', value: '/blog/secret?utm=1'}).ok).toBe(false)
    expect(validateRule({kind: 'slug', value: '/blog/secret#top'}).ok).toBe(false)
  })

  it('keeps path case', () => {
    expect(value('slug', '/Blog/Secret')).toBe('/Blog/Secret')
  })
})

describe('addRule', () => {
  it('mints an enabled rule with an id and a timestamp', () => {
    const result = addRule([], {kind: 'domain', value: 'example.com'}, 1234)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.rule.enabled).toBe(true)
    expect(result.rule.createdAt).toBe(1234)
    expect(result.rule.id).toBeTruthy()
    expect(result.rules).toHaveLength(1)
  })

  it('refuses an exact duplicate', () => {
    const first = addRule([], {kind: 'keyword', value: 'Secret'})

    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = addRule(first.rules, {kind: 'keyword', value: 'secret'})

    expect(second.ok).toBe(false)
  })

  it('allows the same value in a different kind', () => {
    const first = addRule([], {kind: 'domain', value: 'example.com'})

    expect(first.ok).toBe(true)
    if (!first.ok) return

    expect(addRule(first.rules, {kind: 'subdomain', value: 'example.com'}).ok).toBe(true)
  })

  it('fails loudly at the cap instead of dropping rules', () => {
    const full: Rule[] = Array.from({length: MAX_RULES}, (_, index) => ({
      id: `rule-${index}`,
      kind: 'keyword' as const,
      value: `word${index}`,
      enabled: true,
      createdAt: 0
    }))

    const result = addRule(full, {kind: 'domain', value: 'example.com'})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(MAX_RULES))
  })

  it('does not mutate the input list', () => {
    const rules: Rule[] = []
    addRule(rules, {kind: 'domain', value: 'example.com'})

    expect(rules).toHaveLength(0)
  })
})

describe('rule list edits', () => {
  it('removes by id and toggles by id', () => {
    const added = addRule([], {kind: 'domain', value: 'example.com'})

    if (!added.ok) throw new Error('setup failed')

    const {rule} = added
    const disabled = setRuleEnabled(added.rules, rule.id, false)

    expect(disabled[0].enabled).toBe(false)
    expect(removeRule(disabled, rule.id)).toHaveLength(0)
  })
})
