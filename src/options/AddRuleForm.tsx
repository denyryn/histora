import {useEffect, useState} from 'react'
import {getDomain} from 'tldts'
import type {Rule, RuleKind} from '../core/match'
import {validateRule} from '../core/rules'
import {createRule, listRules, previewRule, type Preview} from '../rules/service'
import {api} from '../history/api'
import {cleanupNote} from '../ui/cleanup'
import {shortUrl} from '../ui/display'
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
import {cn} from '../lib/utils'

const KINDS: Array<{
  value: RuleKind
  label: string
  field: string
  placeholder: string
  example: string
  hint: string
}> = [
  {
    value: 'domain',
    label: 'Site domain',
    field: 'Domain',
    placeholder: 'example.com',
    example: 'example.com',
    hint: 'Matches the exact site. Other subdomains are not included.'
  },
  {
    value: 'subdomain',
    label: 'Exact host',
    field: 'Host',
    placeholder: 'www.example.com',
    example: 'www.example.com',
    hint: 'Matches one exact host, at any depth.'
  },
  {
    value: 'keyword',
    label: 'Word in the URL',
    field: 'Word',
    placeholder: 'receipt',
    example: 'receipt',
    hint: 'Matches one whole word: a host label, a path segment, or a query value.'
  },
  {
    value: 'slug',
    label: 'Path on every site',
    field: 'Path',
    placeholder: '/account/orders',
    example: '/account/orders',
    hint: 'Matches one exact path, ignoring the query and fragment.'
  }
]

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

const hostOf = (raw: string): string => {
  try {
    return new URL(raw).host
  } catch {
    return raw
  }
}

/**
 * A pasted URL is the likeliest input, and the strict validators refuse it.
 * Offer the part the current kind needs as a button, never rewrite silently.
 */
const correctionFor = (kind: RuleKind, raw: string): {value: string; label: string} | null => {
  const text = raw.trim()

  if (!text || /\s/.test(text) || kind === 'keyword') return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !text.includes('/')) return null

  let url: URL

  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  if (kind === 'domain') {
    const domain = getDomain(url.host)

    return domain && domain !== text ? {value: domain, label: `Use ${domain}`} : null
  }

  if (kind === 'subdomain') {
    return url.host !== text ? {value: url.host, label: `Use ${url.host}`} : null
  }

  return url.pathname !== text ? {value: url.pathname, label: `Use ${url.pathname}`} : null
}

type PreviewState = {key: string; data: Preview}

export default function AddRuleForm({
  open,
  onOpenChange,
  onSaved,
  onCleaned,
  returnFocus
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (rules: Rule[]) => void
  onCleaned: () => void
  returnFocus: {current: HTMLElement | null}
}) {
  const [kind, setKind] = useState<RuleKind>('domain')
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const focusValue = () => document.getElementById('rule-value')?.focus()

  const selected = KINDS.find((entry) => entry.value === kind) ?? KINDS[0]

  useEffect(() => {
    const raw = value.trim()

    if (!raw) {
      setPreview(null)
      setPreviewing(false)
      setPreviewError(null)
      return
    }

    let live = true

    setPreview(null)
    setPreviewing(true)
    setPreviewError(null)

    const timer = setTimeout(() => {
      const checked = validateRule({kind, value: raw})

      if (!checked.ok) {
        setPreviewing(false)
        setPreviewError(checked.error)
        return
      }

      previewRule(kind, checked.value)
        .then((data) => {
          if (live) setPreview({key: `${kind}:${checked.value}`, data})
        })
        .catch((cause) => {
          if (live) {
            setPreviewError(errorText(cause, 'The preview could not read your history.'))
          }
        })
        .finally(() => {
          if (live) setPreviewing(false)
        })
    }, 300)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [kind, value])

  const checked = value.trim() ? validateRule({kind, value}) : null
  const ready = Boolean(
    checked?.ok && preview && preview.key === `${kind}:${checked.value}` && !saving
  )
  const correction = correctionFor(kind, value)

  const chooseKind = (next: RuleKind) => {
    setKind(next)
    setValue('')
    setNote(null)
    setSaveError(null)
    focusValue()
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    setNote(null)

    try {
      const rule = await createRule(kind, value.trim())

      onSaved(await listRules())

      let result
      try {
        result = await api.runtime.sendMessage({type: 'sweep-rule', ruleId: rule.id})
      } catch {
        result = undefined
      }

      setNote(cleanupNote(result))
      onCleaned()
      setValue('')
      setPreview(null)
      focusValue()
    } catch (cause) {
      setSaveError(errorText(cause, 'The rule could not be added. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const hits = preview?.data.hits ?? []
  const slugHosts =
    kind === 'slug' ? Array.from(new Set(hits.map((hit) => hostOf(hit.url)))) : []

  const changeOpen = (next: boolean) => {
    if (!next) {
      setNote(null)
      setSaveError(null)
    }

    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const content = event.currentTarget as HTMLElement | null
          content?.querySelector<HTMLElement>('#rule-value')?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          // The empty-state trigger unmounts once the first rule exists.
          const target = returnFocus.current?.isConnected
            ? returnFocus.current
            : document.getElementById('add-rule-trigger')

          target?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Add a rule</DialogTitle>
          <DialogDescription>
            Matching pages are removed from your history.
          </DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className="text-sm text-muted-foreground">What should it match?</legend>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((entry) => (
              <label
                key={entry.value}
                className={cn(
                  'relative block cursor-pointer rounded-lg border px-3 py-2 transition-colors duration-150 motion-reduce:transition-none',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                  kind === entry.value
                    ? 'border-primary bg-muted'
                    : 'border-border hover:bg-accent'
                )}
              >
                <input
                  type="radio"
                  name="rule-kind"
                  value={entry.value}
                  checked={kind === entry.value}
                  onChange={() => chooseKind(entry.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <span className="block text-sm font-medium">{entry.label}</span>
                <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                  {entry.example}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="rule-value">{selected.field}</Label>
          <Input
            id="rule-value"
            value={value}
            placeholder={selected.placeholder}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="rule-value-hint"
            onChange={(event) => {
              setValue(event.target.value)
              setNote(null)
              setSaveError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) {
                event.preventDefault()
                void save()
              }
            }}
          />
          <p id="rule-value-hint" className="text-xs text-muted-foreground">
            {selected.hint}
          </p>

          {correction ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 justify-self-start"
              onClick={() => {
                setValue(correction.value)
                setNote(null)
                setSaveError(null)
              }}
            >
              {correction.label}
            </Button>
          ) : null}
        </div>

        {kind === 'slug' ? (
          <p className="rounded-md border border-warn-foreground/25 bg-warn-surface px-3 py-2 text-sm text-warn-foreground">
            A path rule applies to every site with this path, not just the one you have open.
          </p>
        ) : null}

        {value.trim() ? (
          <div className="rounded-lg border border-border bg-muted px-4 py-3" aria-live="polite">
            <h3 className="text-sm font-medium">Preview</h3>

            {previewing ? (
              <p className="mt-1 text-sm text-muted-foreground">Checking your history.</p>
            ) : previewError ? (
              <p className="mt-1 text-sm text-fail-foreground">{previewError}</p>
            ) : preview ? (
              <>
                {kind === 'slug' && slugHosts.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">This path was seen on</p>
                    <p className="mt-0.5 break-words text-sm">{slugHosts.join(', ')}</p>
                  </div>
                ) : null}

                <p className="mt-2 text-sm">
                  {preview.data.count === 0
                    ? 'Nothing in your history matches this rule yet. It still applies to future visits.'
                    : preview.data.count === 1
                      ? 'This rule matches 1 history entry.'
                      : `This rule matches ${preview.data.count} history entries.`}
                </p>

                {preview.data.siblings.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">This site was also seen on</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {preview.data.siblings.map((host) => (
                        <Button
                          key={host}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setKind('subdomain')
                            setValue(host)
                            setNote(null)
                            setSaveError(null)
                          }}
                        >
                          Never keep {host}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {hits.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {hits.map((hit) => (
                      <li key={hit.url} className="truncate font-mono text-xs text-muted-foreground">
                        {shortUrl(hit.url)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {saveError ? (
          <p className="text-sm text-fail-foreground" role="alert">
            {saveError}
          </p>
        ) : null}

        {note ? (
          <p className="text-sm text-ok-foreground" role="status">
            {note}
          </p>
        ) : null}

        {value.trim() && !ready && !previewError && !saving ? (
          <p className="text-xs text-muted-foreground">
            {previewing
              ? 'Checking your history. The rule is saved after the preview finishes.'
              : 'The preview must finish before you can save.'}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={saving}>
              Done
            </Button>
          </DialogClose>
          <Button type="button" disabled={!ready} onClick={() => void save()}>
            {saving ? 'Adding rule' : 'Add rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
