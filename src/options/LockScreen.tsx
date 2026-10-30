import {useEffect, useRef, useState} from 'react'
import {loadLockState, useRecoveryCode, verifyPasscode} from '../settings/lock'
import {Button} from '../components/ui/button'
import {Input} from '../components/ui/input'
import {Label} from '../components/ui/label'

type Mode = 'passcode' | 'code'

export default function LockScreen({
  onUnlocked
}: {
  onUnlocked: (via: Mode) => void
}) {
  const [mode, setMode] = useState<Mode>('passcode')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true

    loadLockState()
      .then((state) => {
        if (live) setRetryAt(state.retryAt)
      })
      .catch(() => undefined)

    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!retryAt) return

    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [retryAt])

  useEffect(() => {
    input.current?.focus()
  }, [mode])

  const wait = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0
  const blocked = wait > 0

  const submit = async () => {
    if (busy || blocked) return

    setBusy(true)
    setError(null)

    try {
      const result =
        mode === 'passcode' ? await verifyPasscode(value) : await useRecoveryCode(value)

      if (result.ok) {
        onUnlocked(mode)
        return
      }

      if (result.reason === 'locked') {
        setRetryAt(result.retryAt ?? Date.now() + 30_000)
        setError('Too many attempts.')
      } else {
        setError(
          mode === 'passcode'
            ? 'That passcode is not right.'
            : 'That backup code is not right.'
        )
      }

      setValue('')
      input.current?.focus()
    } catch {
      setError('The passcode could not be checked. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-[420px] items-center px-5 py-10 sm:px-8">
      <section className="w-full rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl leading-tight">Histora</h1>
        <p className="mt-1 text-sm text-muted-foreground">Options are locked.</p>

        <form
          className="mt-5 grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Label htmlFor="unlock-value">
            {mode === 'passcode' ? 'Passcode' : 'Backup code'}
          </Label>
          <Input
            id="unlock-value"
            ref={input}
            type={mode === 'passcode' ? 'password' : 'text'}
            inputMode={mode === 'passcode' ? 'numeric' : 'text'}
            autoComplete="off"
            spellCheck={false}
            className={mode === 'code' ? 'font-mono tracking-wider' : undefined}
            placeholder={mode === 'passcode' ? '4 to 12 digits' : 'XXXX-XXXX-XXXX-XXXX'}
            value={value}
            disabled={blocked || busy}
            onChange={(event) => {
              setValue(event.target.value)
              setError(null)
            }}
          />

          {error ? (
            <p className="text-sm text-fail-foreground" role="alert">
              {error}
              {blocked ? ` Try again in ${wait}s.` : ''}
            </p>
          ) : blocked ? (
            <p className="text-sm text-fail-foreground" role="alert">
              Too many attempts. Try again in {wait}s.
            </p>
          ) : null}

          <Button type="submit" className="mt-2" disabled={blocked || busy || !value.trim()}>
            {busy ? 'Checking' : mode === 'passcode' ? 'Unlock' : 'Use backup code'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => {
            setMode(mode === 'passcode' ? 'code' : 'passcode')
            setValue('')
            setError(null)
          }}
        >
          {mode === 'passcode' ? 'Use a backup code instead' : 'Use the passcode instead'}
        </button>

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          The passcode hides this page from someone using your browser. It does not
          encrypt your rules or your audit log, and it cannot stop someone who clears
          the extension&rsquo;s data.
        </p>
      </section>
    </main>
  )
}
