/**
 * One namespace for the extension APIs. Firefox exposes `browser` with
 * promises; Chromium exposes `chrome`, whose MV3 methods also return promises.
 */
export const api: any = (globalThis as any).browser ?? (globalThis as any).chrome

export const historyApi = () => api.history

export type HistoryRow = {
  url: string
  title?: string
  lastVisitTime?: number
  visitCount?: number
}
