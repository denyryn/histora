import {useEffect, useState} from 'react'
import {ExternalLink} from 'lucide-react'
import {api} from '../history/api'
import {currentSite, type SiteContext} from '../rules/site'
import {createRule, listRules} from '../rules/service'
import {getSettings, setPaused} from '../settings/service'
import type {Rule, RuleKind} from '../core/match'
import {Button} from '../components/ui/button'
import {Switch} from '../components/ui/switch'
import {cleanupNote} from '../ui/cleanup'

type ActionError = {kind: RuleKind; message: string}

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

export default function PopupApp() {
  const [site, setSite] = useState<SiteContext | null | undefined>(undefined)
  const [rules, setRules] = useState<Rule[]>([])
  const [paused, setPausedState] = useState(false)
  const [pauseError, setPauseError] = useState<string | null>(null)
  const [busy, setBusy] = useState<RuleKind | null>(null)
  const [actionError, setActionError] = useState<ActionError | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    currentSite()
      .then((context) => {
        if (live) setSite(context)
      })
      .catch(() => {
        if (live) setSite(null)
      })

    Promise.all([getSettings(), listRules()])
      .then(([settings, loadedRules]) => {
        if (!live) return
        setPausedState(settings.paused)
        setRules(loadedRules)
      })
      .catch(() => {
        if (live) setPauseError('Settings could not be read. Reopen the popup to try again.')
      })

    return () => {
      live = false
    }
  }, [])

  const version = api.runtime.getManifest().version

  const addRule = async (kind: RuleKind, value: string) => {
    setBusy(kind)
    setActionError(null)
    setNote(null)

    try {
      const rule = await createRule(kind, value)

      setRules(await listRules())

      let result
      try {
        result = await api.runtime.sendMessage({type: 'sweep-rule', ruleId: rule.id})
      } catch {
        result = undefined
      }

      setNote(cleanupNote(result))
    } catch (cause) {
      setActionError({
        kind,
        message: errorText(cause, 'The rule could not be added. Try again.')
      })
    } finally {
      setBusy(null)
    }
  }

  const togglePause = async (next: boolean) => {
    const previous = paused
    setPausedState(next)
    setPauseError(null)

    try {
      const settings = await setPaused(next)
      setPausedState(settings.paused)
    } catch (cause) {
      setPausedState(previous)
      setPauseError(errorText(cause, 'The pause setting could not be saved. Try again.'))
    }
  }

  const siteRule = site?.domain ? rules.find((rule) => rule.id === `domain:${site.domain}`) : undefined
  const hostRule = site ? rules.find((rule) => rule.id === `subdomain:${site.host}`) : undefined
  const siteDisabled = !site?.domain || Boolean(siteRule) || busy !== null
  const hostDisabled = !site || Boolean(hostRule) || busy !== null

  return (
    <main className="w-[340px] bg-background text-foreground">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <h1 className="font-display text-xl leading-tight">Histora</h1>
        <span className="font-mono text-xs text-muted-foreground">{version}</span>
      </header>

      <section className="reveal mt-3 border-t border-border px-4 py-3" aria-labelledby="site-heading">
        <h2 id="site-heading" className="text-sm font-medium">
          Current site
        </h2>

        {site === undefined ? (
          <p className="mt-1 text-sm text-muted-foreground" role="status">
            Reading this page.
          </p>
        ) : site === null ? (
          <p className="mt-1 text-sm text-muted-foreground">
            This page cannot be read because Histora only works on http and https pages.
          </p>
        ) : (
          <>
            <p className="mt-1 truncate font-display text-[17px]" title={site.host}>
              {site.host}
            </p>

            <div className="mt-3 grid gap-2">
              <Button
                type="button"
                className="h-auto flex-col items-start gap-0 py-2 text-left"
                disabled={siteDisabled}
                onClick={() => void addRule('domain', site.domain ?? site.host)}
              >
                <span>{busy === 'domain' ? 'Adding this site' : 'Never keep this site'}</span>
                <span className="text-xs font-normal opacity-70">
                  {!site.domain
                    ? 'No site domain here'
                    : siteRule
                      ? 'Already added'
                      : `${site.domain} only`}
                </span>
              </Button>

              {site.domain !== site.host ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-0 py-2 text-left"
                  disabled={hostDisabled}
                  onClick={() => void addRule('subdomain', site.host)}
                >
                  <span>{busy === 'subdomain' ? 'Adding this host' : 'Never keep this subdomain'}</span>
                  <span className="text-xs font-normal opacity-70">
                    {hostRule ? 'Already added' : `${site.host} only`}
                  </span>
                </Button>
              ) : null}
            </div>

            {actionError ? (
              <p className="mt-2 text-sm text-fail-foreground" role="alert">
                {actionError.message}
              </p>
            ) : null}

            {note ? (
              <p className="mt-2 text-sm text-ok-foreground" role="status">
                {note}
              </p>
            ) : null}
          </>
        )}

        {site === null ? (
          <div className="mt-3 grid gap-2">
            <Button type="button" disabled>
              Never keep this site
            </Button>
            <Button type="button" variant="outline" disabled>
              Never keep this subdomain
            </Button>
          </div>
        ) : null}
      </section>

      <section className="border-t border-border px-4 py-3" aria-labelledby="pause-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pause-heading" className="text-sm font-medium">
            Pause removal
          </h2>
          <Switch
            checked={paused}
            onCheckedChange={(next) => void togglePause(next)}
            aria-label="Pause removal"
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {paused
            ? 'Paused. Nothing is removed from your history.'
            : 'On. Visits that match a rule are removed from history.'}
        </p>
        {pauseError ? (
          <p className="mt-1 text-sm text-fail-foreground" role="alert">
            {pauseError}
          </p>
        ) : null}
      </section>

      <footer className="border-t border-border px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => api.runtime.openOptionsPage()}
        >
          <ExternalLink aria-hidden="true" />
          Open settings
        </Button>
      </footer>
    </main>
  )
}
