import {useRef, useState, type ChangeEvent} from 'react'
import {Download, Plus, Trash2, Upload} from 'lucide-react'
import {ruleLabel} from '../core/format'
import type {Rule} from '../core/match'
import {MAX_RULES} from '../core/rules'
import {rulesFile, rulesFileName} from '../rules/export'
import {importRules, type ImportResult} from '../rules/import'
import {removeRule, setRuleEnabled} from '../rules/service'
import {Button} from '../components/ui/button'
import {Switch} from '../components/ui/switch'
import {cn} from '../lib/utils'
import {downloadText} from '../ui/download'

type Props = {
  rules: Rule[]
  error: string | null
  loading: boolean
  onRules: (rules: Rule[]) => void
  onAddRule: (trigger: HTMLElement) => void
}

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

type Note = {kind: 'info' | 'error'; text: string}

const importNote = (result: ImportResult): string => {
  const parts: string[] = []

  if (result.added > 0) {
    parts.push(`Added ${result.added} ${result.added === 1 ? 'rule' : 'rules'}.`)
  }

  if (result.skipped > 0) {
    parts.push(result.skipped === 1 ? '1 was already there.' : `${result.skipped} were already there.`)
  }

  if (result.rejected > 0) {
    parts.push(
      result.rejected === 1
        ? '1 entry could not be added.'
        : `${result.rejected} entries could not be added.`
    )
  }

  if (result.full) parts.push(`You already have ${MAX_RULES} rules, so the rest were not added.`)

  return parts.join(' ')
}

export default function RulesSection({rules, error, loading, onRules, onAddRule}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{id: string; message: string} | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const importFile = async (file: File) => {
    setNote(null)
    setImporting(true)

    try {
      const result = await importRules(await file.text())
      onRules(result.rules)

      const text = importNote(result)
      if (text) setNote({kind: 'info', text})
    } catch (cause) {
      setNote({kind: 'error', text: errorText(cause, 'That file could not be imported.')})
    } finally {
      setImporting(false)
    }
  }

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    // Reset so picking the same file again still fires change.
    event.currentTarget.value = ''
    if (file) void importFile(file)
  }

  const toggle = async (rule: Rule, enabled: boolean) => {
    setBusyId(rule.id)
    setRowError(null)
    setNote(null)

    try {
      onRules(await setRuleEnabled(rule.id, enabled))
    } catch (cause) {
      setRowError({id: rule.id, message: errorText(cause, 'This rule could not be changed.')})
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (rule: Rule) => {
    setBusyId(rule.id)
    setRowError(null)
    setNote(null)

    try {
      onRules(await removeRule(rule.id))
    } catch (cause) {
      setRowError({id: rule.id, message: errorText(cause, 'This rule could not be deleted.')})
    } finally {
      setBusyId(null)
    }
  }

  const exportRules = () => {
    downloadText(rulesFileName(), rulesFile(rules), 'application/json')
  }

  return (
    <section className="mt-8 border-t border-border pt-5" aria-labelledby="rules-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="rules-heading" className="text-lg">
          Rules
        </h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {rules.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {rules.length === 1 ? '1 rule' : `${rules.length} rules`}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || error !== null || rules.length === 0}
            onClick={exportRules}
          >
            <Download aria-hidden="true" className="hidden sm:block" />
            Export
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || error !== null || importing}
            onClick={() => fileRef.current?.click()}
          >
            <Upload aria-hidden="true" className="hidden sm:block" />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={pickFile}
          />
          <Button
            id="add-rule-trigger"
            type="button"
            size="sm"
            onClick={(event) => onAddRule(event.currentTarget)}
          >
            <Plus aria-hidden="true" />
            Add a rule
          </Button>
        </div>
      </div>

      {note ? (
        <p
          className={cn(
            'mt-3 text-sm',
            note.kind === 'error' ? 'text-fail-foreground' : 'text-muted-foreground'
          )}
          role={note.kind === 'error' ? 'alert' : 'status'}
        >
          {note.text}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-fail-foreground" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !error ? (
        <p className="mt-3 text-sm text-muted-foreground">Reading your rules.</p>
      ) : null}

      {!loading && !error && rules.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-y border-border py-5">
          <p className="text-sm text-muted-foreground">
            No rules yet. Add one, or use the popup on a site you want removed.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(event) => onAddRule(event.currentTarget)}
          >
            Add a rule
          </Button>
        </div>
      ) : null}

      {rules.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {rules.map((rule) => {
            const label = ruleLabel(rule)
            const busy = busyId === rule.id

            return (
              <li key={rule.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p
                    className={cn(
                      'min-w-0 break-words text-sm',
                      rule.enabled ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </p>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={rule.enabled}
                      disabled={busy}
                      aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${label}`}
                      onCheckedChange={(enabled) => void toggle(rule, enabled)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      className="hover:text-destructive"
                      aria-label={`Delete ${label}`}
                      onClick={() => void remove(rule)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {rowError?.id === rule.id ? (
                  <p className="mt-1 text-sm text-fail-foreground" role="alert">
                    {rowError.message}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
