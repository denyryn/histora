import {describe, expect, it} from 'vitest'
import {match, matchRule, type Rule, type RuleKind} from '../src/core/match'
import {parseUrl} from '../src/core/normalize'

const rule = (kind: RuleKind, value: string, enabled = true): Rule => ({
  id: `${kind}:${value}`,
  kind,
  value,
  enabled,
  createdAt: 0
})

const matched = (kind: RuleKind, value: string, url: string) =>
  match([rule(kind, value)], url) !== null

// One row per case in PLAN.md §4.4. Adding a rule kind means adding rows here.
describe('match table (PLAN.md §4.4)', () => {
  const rows: Array<[RuleKind, string, string, boolean, string]> = [
    ['keyword', 'porn', 'https://example.com/porn/1', true, 'path segment token'],
    ['keyword', 'porn', 'https://porn.example.net/', true, 'host label token'],
    ['keyword', 'porn', 'https://example.com/list?tag=porn', true, 'query value token'],
    ['keyword', 'porn', 'https://pornography.example/', false, 'token is pornography'],
    ['keyword', 'porn', 'https://pornhub.com/', false, 'token is pornhub'],
    ['keyword', 'porn', 'https://example.com/a-porn-b', false, 'one segment token'],
    ['keyword', 'porn', 'https://example.com/PORN', true, 'case-insensitive'],
    ['domain', 'example.com', 'https://example.com/', true, 'host equal'],
    ['domain', 'example.com', 'https://www.example.com/', false, 'different host'],
    ['domain', 'example.com', 'http://example.com:8080/x', true, 'port irrelevant'],
    ['domain', 'example.com', 'https://notexample.com/', false, 'different host'],
    ['domain', 'example.com', 'https://example.com.evil.co/', false, 'different host'],
    ['subdomain', 'www.example.com', 'https://www.example.com/x', true, 'host equal'],
    ['subdomain', 'www.example.com', 'https://example.com/', false, 'different host'],
    ['subdomain', 'a.b.example.com', 'https://a.b.example.com/', true, 'any host accepted'],
    ['subdomain', 'a.example.com', 'https://b.a.example.com/', false, 'host equal only'],
    ['slug', '/blog/secret', 'https://any.site/blog/secret', true, 'exact path'],
    ['slug', '/blog/secret', 'https://any.site/blog/secret?utm=1', true, 'query ignored'],
    ['slug', '/blog/secret', 'https://any.site/blog/secret/', true, 'trailing slash'],
    ['slug', '/blog/secret', 'https://other.site/blog/secret', true, 'host-agnostic'],
    ['slug', '/blog/secret', 'https://any.site/blog/secret-2', false, 'not equal'],
    ['slug', '/blog/secret', 'https://any.site/blog/secret/child', false, 'exact, not prefix'],
    ['slug', '/Blog/Secret', 'https://any.site/blog/secret', false, 'path case preserved'],
    ['slug', '/café', 'https://any.site/caf%C3%A9', true, 'decoded comparison'],
    ['keyword', 'porn', 'file:///home/u/porn.txt', false, 'non-http scheme ignored']
  ]

  for (const [kind, value, url, expected, why] of rows) {
    it(`${kind} ${value} vs ${url} → ${expected ? 'match' : 'no match'} (${why})`, () => {
      expect(matched(kind, value, url)).toBe(expected)
    })
  }

  it('strips the fragment before comparing', () => {
    expect(matched('keyword', 'site', 'https://site.test/#frag')).toBe(true)
    expect(matched('keyword', 'frag', 'https://site.test/#frag')).toBe(false)
  })
})

describe('match', () => {
  it('ignores disabled rules', () => {
    expect(match([rule('domain', 'example.com', false)], 'https://example.com/')).toBeNull()
  })

  it('returns the first matching rule and its reason', () => {
    const first = rule('keyword', 'secret', true)
    const second = rule('domain', 'example.com', true)

    const result = match([rule('domain', 'other.test'), first, second], 'https://example.com/secret')

    expect(result?.rule.id).toBe(first.id)
    expect(result?.reason).toBe('token "secret"')
  })

  it('never matches a URL it cannot parse', () => {
    expect(match([rule('keyword', 'porn')], 'file:///porn.txt')).toBeNull()
  })

  it('does not touch a URL that matches nothing', () => {
    expect(match([rule('domain', 'example.com')], 'https://elsewhere.test/x')).toBeNull()
  })
})

describe('matchRule', () => {
  it('reports the reason without going through the rule list', () => {
    const parsed = parseUrl('https://a.example.com/p')
    const reason = parsed ? matchRule(rule('subdomain', 'a.example.com'), parsed) : null

    expect(reason).toBe('host a.example.com')
  })
})
