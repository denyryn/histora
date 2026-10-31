import type {Rule, RuleKind} from '../core/match'

export const RULES_FILE_VERSION = 1

export type ExportedRule = {kind: RuleKind; value: string; enabled: boolean}

const pad = (value: number): string => String(value).padStart(2, '0')

/** Local date, so the filename matches the day the user exported on. */
export function rulesFileName(now = new Date()): string {
  return `histora-rules-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** A readable copy of the rules: what to remove, nothing about the history. */
export function rulesFile(rules: Rule[], now = new Date()): string {
  const body = {
    version: RULES_FILE_VERSION,
    exportedAt: now.toISOString(),
    rules: rules.map(
      (rule): ExportedRule => ({kind: rule.kind, value: rule.value, enabled: rule.enabled})
    )
  }

  return `${JSON.stringify(body, null, 2)}\n`
}
