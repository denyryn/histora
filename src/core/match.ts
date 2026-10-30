import {parseUrl, type ParsedUrl} from './normalize'
import {urlTokens} from './tokens'

export type RuleKind = 'keyword' | 'domain' | 'subdomain' | 'slug'

export type Rule = {
  id: string
  kind: RuleKind
  value: string
  enabled: boolean
  createdAt: number
}

export type MatchResult = {rule: Rule; reason: string}

/**
 * Strict, single-condition matching. One rule names one exact thing:
 * a token, a host, or a path. No fan-out, no compound conditions.
 */
export function matchRule(rule: Rule, parsed: ParsedUrl): string | null {
  switch (rule.kind) {
    case 'keyword':
      return urlTokens(parsed).has(rule.value.toLowerCase())
        ? `token "${rule.value}"`
        : null

    case 'domain':
    case 'subdomain':
      return parsed.host === rule.value ? `host ${rule.value}` : null

    case 'slug':
      return parsed.path === rule.value || parsed.pathDecoded === rule.value
        ? `path ${rule.value}`
        : null

    default:
      return null
  }
}

/**
 * First enabled rule wins, so the audit log can name a single reason.
 * Non-http(s) URLs never match.
 */
export function match(rules: Rule[], url: string): MatchResult | null {
  const parsed = parseUrl(url)

  if (!parsed) return null

  for (const rule of rules) {
    if (!rule.enabled) continue

    const reason = matchRule(rule, parsed)

    if (reason) return {rule, reason}
  }

  return null
}
