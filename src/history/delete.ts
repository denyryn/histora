import {historyApi} from './api'
import {parseUrl} from '../core/normalize'

export type DeleteOutcome =
  | {ok: true; form: 'raw' | 'href'}
  | {ok: false; error: string}

const stillPresent = async (url: string): Promise<boolean> => {
  const rows = await historyApi().search({text: url, startTime: 0, maxResults: 25})

  return rows.some((row: {url: string}) => row.url === url)
}

/**
 * Deletes the entry named by `url`. The raw string is tried first because that
 * is what the browser reported; the normalized href is the fallback for
 * trailing-slash or host-case differences. Both calls are idempotent.
 */
export async function deleteHistoryUrl(url: string): Promise<DeleteOutcome> {
  const href = parseUrl(url)?.href
  const candidates: Array<{form: 'raw' | 'href'; value: string}> = [{form: 'raw', value: url}]

  if (href && href !== url) candidates.push({form: 'href', value: href})

  let lastError = 'The browser did not remove the entry.'

  for (const candidate of candidates) {
    try {
      await historyApi().deleteUrl({url: candidate.value})
    } catch (error) {
      lastError = String(error)
    }

    if (!(await stillPresent(url))) {
      return {ok: true, form: candidate.form}
    }
  }

  return {ok: false, error: lastError}
}
