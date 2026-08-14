/** Live kyboard JSON so Save / tab switch does not write the open-time buffer. */

const lastJson = new Map<string, string>()
let liveTabId: string | null = null
let liveFlush: (() => string | null) | null = null

export function setStoryboardLiveFlush(tabId: string, fn: (() => string | null) | null): void {
  if (fn) {
    liveTabId = tabId
    liveFlush = fn
    return
  }
  if (liveTabId === tabId) {
    liveTabId = null
    liveFlush = null
  }
}

export function rememberStoryboardJson(tabId: string, json: string): void {
  lastJson.set(tabId, json)
}

export function peekStoryboardJson(tabId: string): string | null {
  return lastJson.get(tabId) ?? null
}

export function flushStoryboardForSave(tabId: string): string | null {
  if (liveTabId === tabId && liveFlush) {
    const json = liveFlush()
    if (json) lastJson.set(tabId, json)
    return json
  }
  return lastJson.get(tabId) ?? null
}

export function forgetStoryboardJson(tabId: string): void {
  lastJson.delete(tabId)
  if (liveTabId === tabId) {
    liveTabId = null
    liveFlush = null
  }
}
