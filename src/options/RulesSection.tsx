import {useState} from 'react'
import {Plus, Trash2} from 'lucide-react'
import {ruleLabel} from '../core/format'
import type {Rule} from '../core/match'
import {removeRule, setRuleEnabled} from '../rules/service'
import {Button} from '../components/ui/button'
import {Switch} from '../components/ui/switch'
import {cn} from '../lib/utils'

type Props = {
  rules: Rule[]
  error: string | null
  loading: boolean
  onRules: (rules: Rule[]) => void
  onAddRule: (trigger: HTMLElement) => void
}

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

export default function RulesSection({rules, error, loading, onRules, onAddRule}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{id: string; message: string} | null>(null)

  const toggle = async (rule: Rule, enabled: boolean) => {
    setBusyId(rule.id)
    setRowError(null)

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

    try {
      onRules(await removeRule(rule.id))
    } catch (cause) {
      setRowError({id: rule.id, message: errorText(cause, 'This rule could not be deleted.')})
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-5" aria-labelledby="rules-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rules-heading" className="text-lg">
          Rules
        </h2>
        <div className="flex items-center gap-3">
          {rules.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {rules.length === 1 ? '1 rule' : `${rules.length} rules`}
            </span>
          ) : null}
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
