import {useEffect, useState} from 'react'
import {clearAudit, readAudit, type AuditEntry} from '../storage/audit'
import {Button} from '../components/ui/button'
import {cn} from '../lib/utils'
import {shortUrl, when} from '../ui/display'

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

export default function AuditSection({
  version,
  refreshKey
}: {
  version: string
  refreshKey: number
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let live = true

    setError(null)

    readAudit()
      .then((loaded) => {
        if (live) setEntries(loaded)
      })
      .catch((cause) => {
        if (live) setError(errorText(cause, 'The audit log could not be read.'))
      })

    return () => {
      live = false
    }
  }, [refreshKey])

  const clear = async () => {
    setClearing(true)
    setError(null)

    try {
      await clearAudit()
      setEntries([])
      setConfirming(false)
    } catch (cause) {
      setError(errorText(cause, 'The audit log could not be cleared.'))
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-5" aria-labelledby="audit-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="audit-heading" className="text-lg">
          Audit log
        </h2>
        <span className="font-mono text-xs text-muted-foreground">{version}</span>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Every removal attempt is recorded here, newest first.
      </p>

      {error ? (
        <p className="mt-2 text-sm text-fail-foreground" role="alert">
          {error}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <div className="mt-2 flex min-h-8 items-center justify-end gap-2">
          {confirming ? (
            <>
              <p className="text-sm text-muted-foreground">Clear the whole log?</p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={clearing}
                onClick={() => void clear()}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={clearing}
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 hover:bg-transparent"
              onClick={() => setConfirming(true)}
            >
              Clear log
            </Button>
          )}
        </div>
      ) : null}

      {entries.length === 0 && !error ? (
        <p className="mt-3 border-y border-border py-5 text-sm text-muted-foreground">
          Nothing removed yet. A visit that matches a rule will appear here.
        </p>
      ) : (
        <ul className="mt-1 max-h-[26rem] divide-y divide-border overflow-y-auto border-y border-border">
          {entries.map((entry) => {
            const failed = entry.result === 'failed'

            return (
              <li key={`${entry.t}-${entry.url}-${entry.ruleId}`} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={cn('truncate text-sm', failed ? 'text-fail-foreground' : 'text-foreground')}
                      title={entry.url}
                    >
                      {shortUrl(entry.url)}
                    </p>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {entry.ruleLabel}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-xs',
                        failed
                          ? 'bg-fail-surface text-fail-foreground'
                          : 'bg-ok-surface text-ok-foreground'
                      )}
                    >
                      {failed ? 'Failed' : 'Removed'}
                    </span>
                    <time className="text-xs text-muted-foreground" dateTime={new Date(entry.t).toISOString()}>
                      {when(entry.t)}
                    </time>
                  </div>
                </div>

                {failed && entry.error ? (
                  <p className="mt-1 break-words text-xs text-fail-foreground">{entry.error}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
