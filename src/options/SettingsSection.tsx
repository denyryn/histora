import {useEffect, useRef, useState} from 'react'
import {getSettings, setPaused, setSweepWindowDays} from '../settings/service'
import {
  disablePasscode,
  loadLockState,
  regenerateRecoveryCode,
  setPasscode
} from '../settings/lock'
import type {Settings} from '../storage/settings'
import {Switch} from '../components/ui/switch'
import {Button} from '../components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog'
import {Input} from '../components/ui/input'
import {Label} from '../components/ui/label'
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

const backupFile = (code: string): string =>
  [
    'Histora backup code',
    '===================',
    '',
    `    ${code}`,
    '',
    'Use it on the Histora options page: open the lock screen, choose',
    '"Use a backup code instead", and enter this code. A correct code turns the',
    'passcode off, so set a new one afterwards.',
    '',
    'Keep this file somewhere you can reach without this browser.',
    ''
  ].join('\n')

export default function SettingsSection({version}: {version: string}) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pauseError, setPauseError] = useState<string | null>(null)
  const [windowError, setWindowError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'pause' | 'window' | 'passcode' | null>(null)

  const [locked, setLocked] = useState(false)
  const [asking, setAsking] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copyNote, setCopyNote] = useState<string | null>(null)
  const passcodeSwitch = useRef<HTMLElement | null>(null)
  const showCodeButton = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let live = true

    getSettings()
      .then((loaded) => {
        if (live) setSettings(loaded)
      })
      .catch((cause) => {
        if (live) setLoadError(errorText(cause, 'Settings could not be read.'))
      })

    loadLockState()
      .then((state) => {
        if (live) setLocked(state.enabled)
      })
      .catch(() => undefined)

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

  const savePasscode = async () => {
    setPinError(null)
    setBusy('passcode')

    try {
      const created = await setPasscode(pin)

      setLocked(true)
      setCode(created.code)
      setCopyNote(null)
      setAsking(false)
      setPin('')
    } catch (cause) {
      setPinError(errorText(cause, 'The passcode could not be saved.'))
    } finally {
      setBusy(null)
    }
  }

  const turnOff = async () => {
    setPinError(null)
    setBusy('passcode')

    try {
      await disablePasscode()
      setLocked(false)
      setCode(null)
      setAsking(false)
      setConfirmOff(false)
      setPin('')
    } catch (cause) {
      setPinError(errorText(cause, 'The passcode could not be turned off.'))
      setConfirmOff(false)
    } finally {
      setBusy(null)
    }
  }

  const showNewCode = async () => {
    setPinError(null)
    setBusy('passcode')

    try {
      const created = await regenerateRecoveryCode()

      setCode(created.code)
      setCopyNote(null)
    } catch (cause) {
      setPinError(errorText(cause, 'A new backup code could not be created.'))
    } finally {
      setBusy(null)
    }
  }

  const copyCode = async () => {
    if (!code) return

    try {
      await navigator.clipboard.writeText(code)
      setCopyNote('Copied.')
    } catch {
      setCopyNote('The browser blocked the copy. Select the code above and copy it by hand.')
    }
  }

  const downloadCode = () => {
    if (!code) return

    const url = URL.createObjectURL(new Blob([backupFile(code)], {type: 'text/plain'}))
    const link = document.createElement('a')

    link.href = url
    link.download = 'histora-backup-code.txt'
    link.click()
    URL.revokeObjectURL(url)
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

          <div className="py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Passcode</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {locked
                    ? 'On. Opening this page asks for the passcode.'
                    : 'Off. Anyone using this browser can open these settings.'}
                </p>
              </div>
              <Switch
                checked={locked || asking}
                disabled={busy === 'passcode'}
                aria-label="Passcode"
                onClick={(event) => {
                  passcodeSwitch.current = event.currentTarget
                }}
                onCheckedChange={(next) => {
                  setPinError(null)
                  setCopyNote(null)

                  if (next) {
                    setAsking(true)
                    setCode(null)
                    setPin('')
                    return
                  }

                  if (!locked) {
                    setAsking(false)
                    setPin('')
                    return
                  }

                  setConfirmOff(true)
                }}
              />
            </div>

            {asking ? (
              <form
                className="mt-3 grid gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  void savePasscode()
                }}
              >
                <Label htmlFor="passcode">New passcode</Label>
                <Input
                  id="passcode"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="4 to 12 digits"
                  value={pin}
                  disabled={busy === 'passcode'}
                  onChange={(event) => {
                    setPin(event.target.value)
                    setPinError(null)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Digits only. You get a backup code next — keep it somewhere else.
                </p>
                <Button
                  type="submit"
                  size="sm"
                  className="mt-1 justify-self-start"
                  disabled={busy === 'passcode' || !pin.trim()}
                >
                  {busy === 'passcode' ? 'Saving' : 'Set passcode'}
                </Button>
              </form>
            ) : null}

            {locked && !asking ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={busy === 'passcode'}
                onClick={(event) => {
                  showCodeButton.current = event.currentTarget
                  void showNewCode()
                }}
              >
                Show a new backup code
              </Button>
            ) : null}

            {pinError ? (
              <p className="mt-1 text-sm text-fail-foreground" role="alert">
                {pinError}
              </p>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between gap-4 py-3">
            <p className="text-sm font-medium">Version</p>
            <span className="font-mono text-xs text-muted-foreground">{version}</span>
          </div>
        </div>
      )}

      <Dialog
        open={code !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCode(null)
            setCopyNote(null)
          }
        }}
      >
        <DialogContent
          hideClose
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = showCodeButton.current ?? passcodeSwitch.current
            target?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Your backup code</DialogTitle>
            <DialogDescription className="text-warn-foreground">
              Save it now. It is the only way back in if you forget the passcode, and it is
              shown only this once.
            </DialogDescription>
          </DialogHeader>

          <code className="block select-all break-all rounded-lg border border-warn-foreground/25 bg-warn-surface px-4 py-3 text-center font-mono text-base tracking-wider text-foreground">
            {code}
          </code>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void copyCode()}>
              Copy code
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadCode}>
              Download .txt
            </Button>
          </div>

          {copyNote ? (
            <p className="text-xs text-warn-foreground" role="status">
              {copyNote}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                I saved it
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            passcodeSwitch.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Turn off the passcode?</DialogTitle>
            <DialogDescription>
              Opening this page will no longer ask for the passcode. Your rules and audit log
              stay as they are.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy === 'passcode'}>
                Keep it on
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy === 'passcode'}
              onClick={() => void turnOff()}
            >
              {busy === 'passcode' ? 'Turning off' : 'Turn off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
