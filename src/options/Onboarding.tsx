import {useState} from 'react'
import {Button} from '../components/ui/button'
import {markOnboardingSeen} from '../settings/service'

export default function Onboarding({onDismissed}: {onDismissed: () => void}) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dismiss = async () => {
    setSaving(true)
    setError(null)

    try {
      await markOnboardingSeen()
      onDismissed()
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'This could not be saved. Try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="reveal-late mt-6 rounded-lg border border-border bg-muted px-4 py-3"
      aria-labelledby="onboarding-heading"
    >
      <h2 id="onboarding-heading" className="text-base font-medium">
        Before you start
      </h2>

      <div className="mt-2 space-y-2 text-sm text-muted-foreground">
        <p>Histora removes pages from your history after you visit them.</p>
        <p>
          It cannot stop the visit being recorded for a moment, and it cannot clear recently closed
          tabs, downloads, or history on other devices.
        </p>
        <p>Nothing leaves your browser.</p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={saving}
        onClick={() => void dismiss()}
      >
        {saving ? 'Saving' : 'Got it'}
      </Button>

      {error ? (
        <p className="mt-2 text-sm text-fail-foreground" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
