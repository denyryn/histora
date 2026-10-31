import type {Rule, RuleKind} from '../core/match'
import {addRule, MAX_RULES} from '../core/rules'
import {loadRules, saveRules} from '../storage/rules'
import {api} from '../history/api'

export type ImportResult = {
  rules: Rule[]
  added: number
  skipped: number
  rejected: number
  full: boolean
}

const KINDS: RuleKind[] = ['keyword', 'domain', 'subdomain', 'slug']

type Row = {kind?: unknown; value?: unknown; enabled?: unknown}

const readRows = (text: string): Row[] => {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  const rows = (parsed as {rules?: unknown} | null)?.rules

  if (!Array.isArray(rows)) throw new Error('That file is not a Histora rules export.')
  if (rows.length === 0) throw new Error('That file has no rules to import.')

  return rows as Row[]
}

const isRow = (row: Row): row is {kind: RuleKind; value: string; enabled?: unknown} =>
  typeof row?.value === 'string' && KINDS.includes(row.kind as RuleKind)

const newestFirst = (rules: Rule[]): Rule[] =>
  [...rules].sort((a, b) => b.createdAt - a.createdAt)

/**
 * Merges an exported rules file into the stored list. Existing rules are never
 * removed or overwritten; anything that fails validation is counted, not thrown.
 */
export async function importRules(text: string, now = Date.now()): Promise<ImportResult> {
  const rows = readRows(text)
  let rules = await loadRules()
  let added = 0
  let skipped = 0
  let rejected = 0
  let full = false

  for (const row of rows) {
    if (rules.length >= MAX_RULES) {
      full = true
      break
    }

    if (!isRow(row)) {
      rejected += 1
      continue
    }

    const result = addRule(rules, {kind: row.kind, value: row.value}, now)

    if (!result.ok) {
      if (result.error === 'That rule already exists.') skipped += 1
      else rejected += 1

      continue
    }

    const created = result.rule
    const enabled = row.enabled !== false

    rules = result.rules.map((rule) => (rule.id === created.id ? {...rule, enabled} : rule))
    added += 1
  }

  if (added === 0) return {rules: newestFirst(rules), added, skipped, rejected, full}

  const stored = newestFirst(rules)

  await saveRules(stored)

  // The same bounded sweep a confirmed rule runs, so imported rules act now.
  try {
    await api.runtime.sendMessage({type: 'sweep-now'})
  } catch {
    // A closed worker only means the next visit or the 6-hour sweep catches up.
  }

  return {rules: stored, added, skipped, rejected, full}
}
