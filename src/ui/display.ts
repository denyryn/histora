/** Host, path and query, without the scheme. Falls back to the raw string. */
export function shortUrl(raw: string): string {
  try {
    const url = new URL(raw)

    return `${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}`
  } catch {
    return raw
  }
}

/** Local date and time, short and unambiguous. */
export function when(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
