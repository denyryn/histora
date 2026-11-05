import {getDomain, parse} from 'tldts'
import {decodePath, hostFromInput, normalizePath} from './normalize'
import type {Rule, RuleKind} from './match'

export const MAX_RULES = 200

export type RuleInput = {kind: RuleKind; value: string}

export type Validation =
  | {ok: true; kind: RuleKind; value: string}
  | {ok: false; error: string}

const isIpHost = (host: string) =>
  /^\[?[0-9a-f:.]+\]?$/i.test(host) && (host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host))

/**
 * Turns user input into the exact value that will be stored and compared.
 * Every rejection names the fix, because these errors surface in the add form.
 */
export function validateRule({kind, value}: RuleInput): Validation {
  const raw = value.trim()

  if (!raw) return {ok: false, error: 'Enter a value for the rule.'}

  switch (kind) {
    case 'keyword': {
      if (/\s/.test(raw)) {
        return {
          ok: false,
          error: 'A keyword matches one token. Drop the spaces and add a rule per word.'
        }
      }

      if (raw.length < 2) {
        return {ok: false, error: 'A keyword needs at least two characters.'}
      }

      return {ok: true, kind, value: raw.toLowerCase()}
    }

    case 'domain': {
      const host = hostFromInput(raw)

      if (!host) return {ok: false, error: 'That is not a hostname.'}

      if (isIpHost(host)) {
        return {
          ok: false,
          error: 'An IP address has no domain. Use the exact host type instead.'
        }
      }

      const registrable = getDomain(host)

      if (!registrable) {
        return {
          ok: false,
          error: `"${host}" is a public suffix, not a site. Add the name in front of it.`
        }
      }

      if (registrable !== host) {
        return {
          ok: false,
          error: `"${host}" is one host of ${registrable}. Use the exact host type for it, or add ${registrable} for the site itself.`
        }
      }

      return {ok: true, kind, value: host}
    }

    case 'subdomain': {
      const host = hostFromInput(raw)

      if (!host) return {ok: false, error: 'That is not a hostname.'}

      return {ok: true, kind, value: host}
    }

    case 'slug': {
      if (raw.includes('?') || raw.includes('#')) {
        return {
          ok: false,
          error: 'A path rule ignores query and fragment. Enter only the path.'
        }
      }

      const path = normalizePath(raw)

      if (path === '/' && raw !== '/') {
        return {ok: false, error: 'That path is empty.'}
      }

      const decoded = decodePath(path)

      if (path !== '/' && decoded === null) {
        return {ok: false, error: 'That path is not valid percent-encoding.'}
      }

      return {ok: true, kind, value: path}
    }

    default:
      return {ok: false, error: 'Unknown rule type.'}
  }
}

/**
 * One field, two shapes: host-like input with a dot or port becomes a host
 * rule, any other plain word becomes a keyword. A bare word is never read as
 * a site even when it is a public suffix ("porn" is a word first).
 */
export function resolveRuleInput(value: string): RuleInput {
  const raw = value.trim()
  const keyword = {kind: 'keyword' as const, value: raw}

  if (!raw || /\s/.test(raw)) return keyword

  const host = hostFromInput(raw)

  if (!host) return keyword

  const site = getDomain(host)

  if (site === host) return {kind: 'domain', value: raw}
  if (site) return {kind: 'subdomain', value: raw}

  const parsed = parse(host)

  if (parsed.isIp) return {kind: 'subdomain', value: raw}
  if (!/[.:]/.test(host)) return keyword
  if (parsed.isIcann && parsed.publicSuffix === host) return {kind: 'domain', value: raw}

  return {kind: 'subdomain', value: raw}
}

const sameRule = (a: Pick<Rule, 'kind' | 'value'>, b: Pick<Rule, 'kind' | 'value'>) =>
  a.kind === b.kind && a.value === b.value

export type AddResult =
  | {ok: true; rules: Rule[]; rule: Rule}
  | {ok: false; error: string}

export function addRule(rules: Rule[], input: RuleInput, now = Date.now()): AddResult {
  const validation = validateRule(input)

  if (!validation.ok) return validation

  const candidate = {kind: validation.kind, value: validation.value}

  if (rules.some((rule) => sameRule(rule, candidate))) {
    return {ok: false, error: 'That rule already exists.'}
  }

  if (rules.length >= MAX_RULES) {
    return {
      ok: false,
      error: `You already have ${MAX_RULES} rules. Remove one before adding another.`
    }
  }

  const rule: Rule = {
    // Deterministic so the id survives a storage round trip and audit entries
    // keep pointing at the same rule after a reload.
    id: `${candidate.kind}:${candidate.value}`,
    kind: candidate.kind,
    value: candidate.value,
    enabled: true,
    createdAt: now
  }

  return {ok: true, rules: [...rules, rule], rule}
}

export function removeRule(rules: Rule[], id: string): Rule[] {
  return rules.filter((rule) => rule.id !== id)
}

export function setRuleEnabled(rules: Rule[], id: string, enabled: boolean): Rule[] {
  return rules.map((rule) => (rule.id === id ? {...rule, enabled} : rule))
}
