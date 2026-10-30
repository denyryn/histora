import {api} from '../history/api'

const KEY = 'audit'

export const AUDIT_LIMIT = 500

export type AuditEntry = {
  t: number
  url: string
  ruleId: string
  ruleLabel: string
  result: 'deleted' | 'failed'
  reason?: string
  error?: string
}

/**
 * Appends are serialized: history events can arrive in parallel, and a
 * read-modify-write race would silently drop entries.
 */
let queue: Promise<void> = Promise.resolve()

export function appendAudit(entry: Omit<AuditEntry, 't'> & {t?: number}): Promise<void> {
  const write = queue.then(async () => {
    const stored = await api.storage.local.get(KEY)
    const current: AuditEntry[] = Array.isArray(stored?.[KEY]) ? stored[KEY] : []

    const next = [{...entry, t: entry.t ?? Date.now()}, ...current].slice(0, AUDIT_LIMIT)

    await api.storage.local.set({[KEY]: next})
  })

  queue = write.catch(() => undefined)

  return write
}

export async function readAudit(): Promise<AuditEntry[]> {
  const stored = await api.storage.local.get(KEY)

  return Array.isArray(stored?.[KEY]) ? (stored[KEY] as AuditEntry[]) : []
}

export async function clearAudit(): Promise<void> {
  await api.storage.local.set({[KEY]: []})
}
