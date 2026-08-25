import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ASK_OTHER_ID, type AskUserAnswer, type AskUserQuestion } from '@shared/agentAsk'

export function AskUserCard({
  title,
  questions,
  pending,
  answers,
  cancelled,
  onConfirm
}: {
  title?: string
  questions: AskUserQuestion[]
  pending: boolean
  answers?: AskUserAnswer[]
  cancelled?: boolean
  onConfirm?: (answers: AskUserAnswer[]) => void
}): ReactNode {
  const { t } = useTranslation()
  const answeredMap = useMemo(() => {
    const m = new Map<string, AskUserAnswer>()
    for (const a of answers || []) m.set(a.questionId, a)
    return m
  }, [answers])
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})

  const ready =
    pending &&
    questions.every((q) => {
      const id = picks[q.id]
      if (!id) return false
      if (id === ASK_OTHER_ID) return Boolean((otherText[q.id] || '').trim())
      return true
    })

  const numbered = questions.length > 1

  return (
    <div
      className={`ai-tool-block ai-ask-card${pending ? ' is-pending' : ''}${cancelled ? ' is-cancelled' : ''}`}
    >
      <div className="ai-tool-block-head ai-ask-head">
        <span className="ai-tool-prompt" aria-hidden>
          &gt;_
        </span>
        <span className="ai-tool-block-title">{title || t('ai.askTitle')}</span>
        <span className="ai-ask-tag">{t('ai.toolTagAsk')}</span>
      </div>
      <div className="ai-ask-body">
        {questions.map((q, i) => {
          const saved = answeredMap.get(q.id)
          const pick = pending ? picks[q.id] : saved?.optionId
          return (
            <div key={q.id} className="ai-ask-q">
              <div className="ai-ask-prompt">
                {numbered ? (
                  <span className="ai-ask-n" aria-hidden>
                    {i + 1}
                  </span>
                ) : null}
                <span>{q.prompt}</span>
              </div>
              <div className="ai-ask-opts" role="group" aria-label={q.prompt}>
                {q.options.map((o) => {
                  const rec = q.recommendedId === o.id
                  const on = pick === o.id
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`ai-ask-chip${on ? ' is-on' : ''}${rec ? ' is-rec' : ''}`}
                      disabled={!pending}
                      aria-pressed={on}
                      onClick={() => setPicks((p) => ({ ...p, [q.id]: o.id }))}
                    >
                      <span className="ai-ask-chip-label">{o.label}</span>
                      {rec ? <span className="ai-ask-rec">{t('ai.askRecommended')}</span> : null}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className={`ai-ask-chip${pick === ASK_OTHER_ID ? ' is-on' : ''}`}
                  disabled={!pending}
                  aria-pressed={pick === ASK_OTHER_ID}
                  onClick={() => setPicks((p) => ({ ...p, [q.id]: ASK_OTHER_ID }))}
                >
                  <span className="ai-ask-chip-label">{t('ai.askOther')}</span>
                </button>
              </div>
              {pick === ASK_OTHER_ID ? (
                pending ? (
                  <input
                    className="ai-ask-other"
                    value={otherText[q.id] || ''}
                    onChange={(e) => setOtherText((o) => ({ ...o, [q.id]: e.target.value }))}
                    placeholder={t('ai.askOtherPlaceholder')}
                  />
                ) : (
                  <div className="ai-ask-other-read">{saved?.otherText || saved?.optionId}</div>
                )
              ) : null}
            </div>
          )
        })}
        {cancelled && !pending ? (
          <div className="ai-ask-cancelled">{t('ai.askCancelled')}</div>
        ) : null}
        {pending ? (
          <div className="ai-ask-foot">
            <button
              type="button"
              className="ai-ask-confirm"
              disabled={!ready}
              title={ready ? t('ai.askConfirm') : t('ai.askConfirmHint')}
              onClick={() => {
                if (!onConfirm || !ready) return
                onConfirm(
                  questions.map((q) => ({
                    questionId: q.id,
                    optionId: picks[q.id],
                    otherText:
                      picks[q.id] === ASK_OTHER_ID ? (otherText[q.id] || '').trim() : undefined
                  }))
                )
              }}
            >
              {t('ai.askConfirm')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
