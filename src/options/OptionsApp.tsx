import {useEffect, useState} from 'react'
import {api} from '../history/api'
import {hasSeenOnboarding} from '../settings/service'
import {listRules} from '../rules/service'
import type {Rule} from '../core/match'
import Onboarding from './Onboarding'
import RulesSection from './RulesSection'
import AddRuleForm from './AddRuleForm'
import AuditSection from './AuditSection'
import SettingsSection from './SettingsSection'

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

export default function OptionsApp() {
  const [rules, setRules] = useState<Rule[]>([])
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [loadingRules, setLoadingRules] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [auditKey, setAuditKey] = useState(0)

  const version = api.runtime.getManifest().version

  useEffect(() => {
    let live = true

    listRules()
      .then((loaded) => {
        if (live) setRules(loaded)
      })
      .catch((cause) => {
        if (live) setRulesError(errorText(cause, 'Your rules could not be read.'))
      })
      .finally(() => {
        if (live) setLoadingRules(false)
      })

    hasSeenOnboarding()
      .then((seen) => {
        if (live) setShowOnboarding(!seen)
      })
      .catch(() => {
        if (live) setShowOnboarding(true)
      })

    return () => {
      live = false
    }
  }, [])

  const acceptRules = (next: Rule[]) => {
    setRules(next)
    setRulesError(null)
  }

  return (
    <main className="reveal mx-auto w-full max-w-[720px] px-5 pb-16 pt-8 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl leading-tight">Histora</h1>
        <span className="font-mono text-xs text-muted-foreground">{version}</span>
      </header>

      {showOnboarding ? <Onboarding onDismissed={() => setShowOnboarding(false)} /> : null}

      <RulesSection
        rules={rules}
        error={rulesError}
        loading={loadingRules}
        onRules={acceptRules}
      />

      <AddRuleForm onSaved={acceptRules} onCleaned={() => setAuditKey((key) => key + 1)} />

      <AuditSection version={version} refreshKey={auditKey} />

      <SettingsSection version={version} />
    </main>
  )
}
