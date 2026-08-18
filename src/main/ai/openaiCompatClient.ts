import { getApiKey, loadAiSettings } from './aiSettings'

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type StreamEvent =
  | { type: 'content'; text: string }
  | {
      type: 'tool_call_delta'
      index: number
      id?: string
      name?: string
      argumentsDelta?: string
    }
  | { type: 'error'; message: string }
  | { type: 'done'; finishReason: string | null }

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function toReasoningEffort(level: string): 'low' | 'medium' | 'high' {
  if (level === 'high') return 'high'
  if (level === 'low') return 'low'
  return 'medium'
}

function shouldDropReasoning(status: number, text: string): boolean {
  if (status !== 400 && status !== 422) return false
  const t = text.toLowerCase()
  return /reasoning_effort|reasoning\.effort|unrecognized|unknown parameter|unexpected keyword|extra inputs|unknown field/.test(
    t
  )
}

const CONNECT_TIMEOUT_MS = 45_000

export async function streamChatCompletion(opts: {
  messages: ChatCompletionMessage[]
  tools?: ToolDef[]
  signal?: AbortSignal
  onEvent: (ev: StreamEvent) => void
}): Promise<void> {
  const settings = loadAiSettings()
  const key = getApiKey()
  if (!key) {
    opts.onEvent({ type: 'error', message: 'API key is not set. Open Settings → AI.' })
    opts.onEvent({ type: 'done', finishReason: 'error' })
    return
  }

  const url = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`
  if (!settings.baseUrl?.trim()) {
    opts.onEvent({
      type: 'error',
      message: 'Base URL is empty. Open Settings → AI and set the API endpoint.'
    })
    opts.onEvent({ type: 'done', finishReason: 'error' })
    return
  }
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: opts.messages,
    temperature: settings.temperature,
    stream: true,
    reasoning_effort: toReasoningEffort(settings.thinkingLevel)
  }
  if (opts.tools && opts.tools.length > 0 && settings.agentEnabled) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  } else {
    // Ask / tools-off: omit tools. Some gateways reuse the previous turn's
    // tool list unless tool_choice is explicitly none.
    body.tool_choice = 'none'
  }

  const ac = new AbortController()
  let connectTimedOut = false
  const timer = setTimeout(() => {
    connectTimedOut = true
    ac.abort()
  }, CONNECT_TIMEOUT_MS)
  const onUserAbort = (): void => ac.abort()
  if (opts.signal?.aborted) ac.abort()
  else opts.signal?.addEventListener('abort', onUserAbort)

  const post = (payload: Record<string, unknown>): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(payload),
      signal: ac.signal
    })

  try {
    let res: Response
    try {
      res = await post(body)
      // Headers received: drop the connect timer so long SSE/tool turns are not aborted at 45s.
      clearTimeout(timer)
    } catch (err) {
      if (opts.signal?.aborted) {
        opts.onEvent({ type: 'done', finishReason: 'abort' })
        return
      }
      const msg = connectTimedOut
        ? 'Timed out connecting to the API (45s). Check Base URL, model, and network.'
        : err instanceof Error
          ? err.message
          : String(err)
      opts.onEvent({ type: 'error', message: msg })
      opts.onEvent({ type: 'done', finishReason: 'error' })
      return
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (body.reasoning_effort !== undefined && shouldDropReasoning(res.status, text)) {
        delete body.reasoning_effort
        try {
          res = await post(body)
        } catch (err) {
          if (opts.signal?.aborted) {
            opts.onEvent({ type: 'done', finishReason: 'abort' })
            return
          }
          const msg = err instanceof Error ? err.message : String(err)
          opts.onEvent({ type: 'error', message: msg })
          opts.onEvent({ type: 'done', finishReason: 'error' })
          return
        }
      }
      if (!res.ok) {
        const retryText = body.reasoning_effort === undefined ? await res.text().catch(() => '') : text
        opts.onEvent({
          type: 'error',
          message: `HTTP ${res.status}: ${(retryText || text).slice(0, 500) || res.statusText}`
        })
        opts.onEvent({ type: 'done', finishReason: 'error' })
        return
      }
    }

    if (!res.body) {
      opts.onEvent({ type: 'error', message: 'Empty response body' })
      opts.onEvent({ type: 'done', finishReason: 'error' })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finishReason: string | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') {
            opts.onEvent({ type: 'done', finishReason })
            return
          }
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string
                  tool_calls?: Array<{
                    index: number
                    id?: string
                    function?: { name?: string; arguments?: string }
                  }>
                }
                finish_reason?: string | null
              }>
            }
            const choice = json.choices?.[0]
            if (!choice) continue
            if (choice.finish_reason) finishReason = choice.finish_reason
            const delta = choice.delta
            if (delta?.content) opts.onEvent({ type: 'content', text: delta.content })
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                opts.onEvent({
                  type: 'tool_call_delta',
                  index: tc.index,
                  id: tc.id,
                  name: tc.function?.name,
                  argumentsDelta: tc.function?.arguments
                })
              }
            }
          } catch {
            /* ignore partial JSON */
          }
        }
      }
    } catch (err) {
      if (opts.signal?.aborted) {
        opts.onEvent({ type: 'done', finishReason: 'abort' })
        return
      }
      const msg = connectTimedOut
        ? 'Timed out connecting to the API (45s). Check Base URL, model, and network.'
        : err instanceof Error
          ? err.message
          : String(err)
      opts.onEvent({ type: 'error', message: msg })
    }

    opts.onEvent({ type: 'done', finishReason })
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onUserAbort)
  }
}
