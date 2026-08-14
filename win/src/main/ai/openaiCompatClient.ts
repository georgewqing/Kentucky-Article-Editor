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
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: opts.messages,
    temperature: settings.temperature,
    stream: true
  }
  if (opts.tools && opts.tools.length > 0 && settings.agentEnabled) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  } else {
    // Ask / tools-off: omit tools. Some gateways reuse the previous turn's
    // tool list unless tool_choice is explicitly none.
    body.tool_choice = 'none'
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body),
      signal: opts.signal
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    opts.onEvent({ type: 'error', message: msg })
    opts.onEvent({ type: 'done', finishReason: 'error' })
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    opts.onEvent({
      type: 'error',
      message: `HTTP ${res.status}: ${text.slice(0, 500) || res.statusText}`
    })
    opts.onEvent({ type: 'done', finishReason: 'error' })
    return
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
    const msg = err instanceof Error ? err.message : String(err)
    opts.onEvent({ type: 'error', message: msg })
  }

  opts.onEvent({ type: 'done', finishReason })
}
