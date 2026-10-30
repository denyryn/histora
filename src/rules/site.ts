import {getDomain} from 'tldts'
import {api} from '../history/api'
import {parseUrl} from '../core/normalize'

export type SiteContext = {url: string; host: string; domain: string | null}

/** http(s) only — the same schemes the matcher accepts, so popup rules are always matchable. */
export async function currentSite(): Promise<SiteContext | null> {
  const [tab] = await api.tabs.query({active: true, currentWindow: true})

  if (!tab?.url) return null

  const parsed = parseUrl(tab.url)

  if (!parsed) return null

  return {
    url: tab.url,
    host: parsed.host,
    domain: getDomain(parsed.host)
  }
}
