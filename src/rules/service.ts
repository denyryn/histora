import {getDomain} from 'tldts'
import {addRule, setRuleEnabled as enable, removeRule as remove, validateRule} from '../core/rules'
import {match, type Rule, type RuleKind} from '../core/match'
import {loadRules, saveRules} from '../storage/rules'
import {api} from '../history/api'

export type PreviewHit = {url: string; title?: string; lastVisitTime?: number}

/** `siblings`: other hosts on the same site, for one-tap subdomain rules. */
export type Preview = {count: number; hits: PreviewHit[]; siblings: string[]}

const PREVIEW_HIT_LIMIT = 5
const SIBLING_LIMIT = 5
const SEARCH_LIMIT = 200

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * What history.search would act on, using the same query the sweep uses.
 * The count is distinct URLs; an entry for each visit to the same URL
 * reports once.
 */
export async function previewRule(kind: RuleKind, input: string): Promise<Preview> {
  const validation = validateRule({kind, value: input})

  if (!validation.ok) return {count: 0, hits: [], siblings: []}

  // Normalized form, so the preview counts what saving would act on.
  const value = validation.value
  const candidate = {id: `${kind}:${value}`, kind, value, enabled: true, createdAt: 0}

  const rows = await api.history.search({text: value, startTime: 0, maxResults: SEARCH_LIMIT})

  const seen = new Set<string>()
  const matched: Array<PreviewHit & {lastVisitTime?: number}> = []
  const siblings = new Set<string>()

  for (const row of rows) {
    if (!row?.url || seen.has(row.url)) continue

    if (match([candidate], row.url)) {
      seen.add(row.url)
      matched.push({url: row.url, title: row.title, lastVisitTime: row.lastVisitTime})
      continue
    }

    // A domain rule never matches www. or another subdomain, so offer them
    // rather than let the count silently hide them.
    if (kind !== 'domain') continue

    const host = hostOf(row.url)

    if (host && host !== value && getDomain(host) === value) siblings.add(host)
  }

  // The engine's order is not guaranteed, so the sort is ours.
  matched.sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))

  return {
    count: matched.length,
    hits: matched.slice(0, PREVIEW_HIT_LIMIT),
    siblings: [...siblings].sort().slice(0, SIBLING_LIMIT)
  }
}

export async function createRule(kind: RuleKind, input: string): Promise<Rule> {
  const rules = await loadRules()
  const result = addRule(rules, {kind, value: input})

  if (!result.ok) throw new Error(result.error)

  await saveRules(result.rules)

  return result.rule
}

/** Newest first, for the rule list. */
export async function listRules(): Promise<Rule[]> {
  return (await loadRules()).sort((a, b) => b.createdAt - a.createdAt)
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<Rule[]> {
  const next = enable(await loadRules(), id, enabled)

  await saveRules(next)

  return next.sort((a, b) => b.createdAt - a.createdAt)
}

export async function removeRule(id: string): Promise<Rule[]> {
  const next = remove(await loadRules(), id)

  await saveRules(next)

  return next.sort((a, b) => b.createdAt - a.createdAt)
}
