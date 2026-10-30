import {api} from '../history/api'
import type {Rule, RuleKind} from '../core/match'

const KINDS: RuleKind[] = ['keyword', 'domain', 'subdomain', 'slug']
const KEY = 'rules'

/**
 * Chrome sync allows 8 KB per item. Stay under it with room for the JSON
 * envelope, and fail loudly instead of letting the browser drop the write.
 */
export const SYNC_BUDGET_BYTES = 7000

/** [kind index, value, enabled as 0/1, createdAt in seconds] */
type Row = [number, string, 0 | 1, number]

export function encodeRules(rules: Rule[]): string {
  const rows: Row[] = rules.map((rule) => [
    KINDS.indexOf(rule.kind),
    rule.value,
    rule.enabled ? 1 : 0,
    Math.round(rule.createdAt / 1000)
  ])

  return JSON.stringify(rows)
}

export function decodeRules(raw: unknown): Rule[] {
  if (typeof raw !== 'string' || !raw) return []

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const rules: Rule[] = []

  for (const row of parsed) {
    if (!Array.isArray(row) || row.length < 4) continue

    const [kindIndex, value, enabled, createdAt] = row
    const kind = KINDS[kindIndex]

    if (!kind || typeof value !== 'string' || !value) continue

    rules.push({
      // Deterministic, so an audit entry still points at the same rule after a reload.
      id: `${kind}:${value}`,
      kind,
      value,
      enabled: enabled === 1,
      createdAt: typeof createdAt === 'number' ? createdAt * 1000 : 0
    })
  }

  return rules
}

export async function loadRules(): Promise<Rule[]> {
  const stored = await api.storage.sync.get(KEY)

  return decodeRules(stored?.[KEY])
}

export function assertWithinBudget(encoded: string): void {
  // Both browsers measure the UTF-8 bytes of the stored JSON string plus the key,
  // so `encoded.length` (UTF-16 units) undercounts non-ASCII values by up to 3x.
  const bytes = new TextEncoder().encode(JSON.stringify(encoded)).length + KEY.length

  if (bytes > SYNC_BUDGET_BYTES) {
    throw new Error(
      `These rules need ${bytes} bytes and browser sync allows ${SYNC_BUDGET_BYTES}. Shorten long paths or remove rules.`
    )
  }
}

export async function saveRules(rules: Rule[]): Promise<void> {
  const encoded = encodeRules(rules)

  assertWithinBudget(encoded)

  await api.storage.sync.set({[KEY]: encoded})
}
