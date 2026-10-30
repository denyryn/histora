import {useEffect, useState} from 'react'
import {getSettings, setPaused, setSweepWindowDays} from '../settings/service'
import type {Settings} from '../storage/settings'
import {Switch} from '../components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'

const WINDOWS = [
  {value: '0', label: 'All history'},
  {value: '30', label: '30 days'},
  {value: '90', label: '90 days'},
  {value: '365', label: '365 days'}
]

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

export default function SettingsSection({version}: {version: string}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pauseError, setPauseError] = useState<string | null>(null)
  const [windowError, setWindowError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pause' | 'window' | null>(null)

  useEffect(() => {
    let live = true

    getSettings()
      .then((loaded) => {
        if (live) setSettings(loaded)
      })
      .catch((cause) => {
        if (live) setLoadError(errorText(cause, 'Settings could not be read.'))
      })

    return () => {
      live = false
    }
  }, [])

  const togglePause = async (next: boolean) => {
    if (!settings) return

    const previous = settings
    setSettings({...settings, paused: next})
    setPauseError(null)
    setBusy('pause')

    try {
      setSettings(await setPaused(next))
    } catch (cause) {
      setSettings(previous)
      setPauseError(errorText(cause, 'The pause setting could not be saved.'))
    } finally {
      setBusy(null)
    }
  }

  const changeWindow = async (next: string) => {
    const days = Number(next)

    setWindowError(null)
    setBusy('window')

    try {
      setSettings(await setSweepWindowDays(days))
    } catch (cause) {
      setWindowError(errorText(cause, 'The sweep window could not be saved.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-5" aria-labelledby="settings-heading">
      <h2 id="settings-heading" className="text-lg">
        Settings
      </h2>

      {loadError ? (
        <p className="mt-3 text-sm text-fail-foreground" role="alert">
          {loadError}
        </p>
      ) : !settings ? (
        <p className="mt-3 text-sm text-muted-foreground">Reading your settings.</p>
      ) : (
        <div className="mt-2 divide-y divide-border border-y border-border">
          <div className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Pause removal</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {settings.paused
                    ? 'Paused. Nothing is removed from your history.'
                    : 'On. Visits that match a rule are removed from history.'}
                </p>
              </div>
              <Switch
                checked={settings.paused}
                disabled={busy === 'pause'}
                aria-label="Pause removal"
                onCheckedChange={(next) => void togglePause(next)}
              />
            </div>
            {pauseError ? (
              <p className="mt-1 text-sm text-fail-foreground" role="alert">
                {pauseError}
              </p>
            ) : null}
          </div>

          <div className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Sweep window</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  How far back each periodic sweep looks. All history includes every visit.
                </p>
              </div>
              <Select
                value={String(settings.sweepWindowDays)}
                disabled={busy === 'window'}
                onValueChange={(next) => void changeWindow(next)}
              >
                <SelectTrigger className="w-[130px] shrink-0" aria-label="Sweep window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {windowError ? (
              <p className="mt-1 text-sm text-fail-foreground" role="alert">
                {windowError}
              </p>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between gap-4 py-3">
            <p className="text-sm font-medium">Version</p>
            <span className="font-mono text-xs text-muted-foreground">{version}</span>
          </div>
        </div>
      )}
    </section>
  )
}
