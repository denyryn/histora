import {useEffect, useState} from 'react'
import {api} from '../history/api'
import {hasSeenOnboarding} from '../settings/service'
import {hasPasscode} from '../settings/lock'
import {listRules} from '../rules/service'
import type {Rule} from '../core/match'
import Onboarding from './Onboarding'
import RulesSection from './RulesSection'
import AddRuleForm from './AddRuleForm'
import AuditSection from './AuditSection'
import SettingsSection from './SettingsSection'
import LockScreen from './LockScreen'

const errorText = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message ? cause.message : fallback

type Access = 'checking' | 'locked' | 'open'

export default function OptionsApp() {
  const [access, setAccess] = useState<Access>('checking')
  const [notice, setNotice] = useState<string | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [loadingRules, setLoadingRules] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [auditKey, setAuditKey] = useState(0)

  const version = api.runtime.getManifest().version

  useEffect(() => {
    let live = true

    hasPasscode()
      .then((locked) => {
        if (live) setAccess(locked ? 'locked' : 'open')
      })
      .catch(() => {
        if (live) setAccess('open')
      })

    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (access !== 'open') return

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
  }, [access])

  const acceptRules = (next: Rule[]) => {
    setRules(next)
    setRulesError(null)
  }

  if (access === 'checking') {
    return (
      <main className="mx-auto w-full max-w-[720px] px-5 py-8 sm:px-8">
        <p className="text-sm text-muted-foreground">Reading your settings.</p>
      </main>
    )
  }

  if (access === 'locked') {
    return (
      <LockScreen
        onUnlocked={(via) => {
          setAccess('open')

          if (via === 'code') {
            setNotice(
              'Backup code accepted. The passcode is now off — set a new one in Settings.'
            )
          }
        }}
      />
    )
  }

  return (
    <main className="reveal mx-auto w-full max-w-[720px] px-5 pb-16 pt-8 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl leading-tight">Histora</h1>
        <span className="font-mono text-xs text-muted-foreground">{version}</span>
      </header>

      {notice ? (
        <p
          className="mt-4 rounded-md border border-warn-foreground/25 bg-warn-surface px-3 py-2 text-sm text-warn-foreground"
          role="status"
        >
          {notice}
        </p>
      ) : null}

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
