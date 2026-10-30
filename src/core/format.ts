import type {Rule} from './match'

/** Human label used in the audit log and, from M4, the rule list. */
export function ruleLabel(rule: Pick<Rule, 'kind' | 'value'>): string {
  switch (rule.kind) {
    case 'keyword':
      return `The word "${rule.value}" anywhere in the URL`

    case 'domain':
      return `Only the exact site ${rule.value}`

    case 'subdomain':
      return `Only the exact host ${rule.value}`

    case 'slug':
      return `This path on every site: ${rule.value}`

    default:
      return rule.value
  }
}
