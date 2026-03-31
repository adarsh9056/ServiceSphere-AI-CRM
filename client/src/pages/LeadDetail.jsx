import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client/react'
import {
  GET_LEAD_DETAIL,
  GET_LEAD_TIMELINE,
  CREATE_TASK,
  CREATE_NOTE,
  ANALYZE_SENTIMENT,
  GENERATE_AI_REPLY,
  SEND_EMAIL,
} from '../graphql/operations'

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-lg px-3 py-1.5 text-sm font-medium',
        active
          ? 'bg-blue-600 text-white dark:bg-blue-500'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const [tab, setTab] = useState('overview')
  const [aiBody, setAiBody] = useState('')
  const [sentimentText, setSentimentText] = useState('')
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('Following up')
  const [composeBody, setComposeBody] = useState('')

  const { data, loading, error, refetch } = useQuery(GET_LEAD_DETAIL, {
    variables: { id },
    skip: !id,
  })
  const { data: tlData } = useQuery(GET_LEAD_TIMELINE, {
    variables: { leadId: id },
    skip: !id,
  })

  const [createTask] = useMutation(CREATE_TASK)
  const [createNote] = useMutation(CREATE_NOTE)
  const [analyzeSentiment] = useMutation(ANALYZE_SENTIMENT)
  const [generateAi] = useMutation(GENERATE_AI_REPLY)
  const [sendEmail] = useMutation(SEND_EMAIL)

  const lead = data?.getLead

  if (loading) {
    return <p className="text-sm text-slate-500">Loading lead…</p>
  }
  if (error || !lead) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error?.message || 'Lead not found'}</p>
        <Link to="/leads" className="text-blue-600 text-sm">
          ← Back to leads
        </Link>
      </div>
    )
  }

  const primaryDeal = lead.deals?.[0]

  async function onAddTask(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const title = fd.get('title')
    if (!title) return
    await createTask({
      variables: {
        leadId: id,
        dealId: primaryDeal?.id,
        title: String(title),
        dueAt: fd.get('due') || null,
      },
    })
    e.target.reset()
    refetch()
  }

  async function onAddNote(e) {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = fd.get('body')
    if (!body) return
    await createNote({ variables: { leadId: id, body: String(body) } })
    e.target.reset()
    refetch()
  }

  async function onAnalyze() {
    if (!sentimentText.trim()) return
    await analyzeSentiment({ variables: { leadId: id, emailBody: sentimentText } })
    setSentimentText('')
    refetch()
  }

  async function onDraft() {
    const { data: d } = await generateAi({ variables: { leadId: id } })
    const body = d.generateAIReply.body
    setAiBody(body)
    setComposeBody(body)
    setComposeTo(lead.email || '')
  }

  async function onSendApproved(e) {
    e.preventDefault()
    await sendEmail({
      variables: {
        leadId: id,
        to: composeTo,
        subject: composeSubject,
        body: composeBody,
      },
    })
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to="/leads" className="text-xs font-medium text-blue-600 dark:text-blue-400">
            ← Leads
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{lead.name}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {lead.company || '—'} · Score {lead.score}{' '}
            {lead.sentiment ? `· Sentiment ${lead.sentiment}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={tab === 'comms'} onClick={() => setTab('comms')}>
          Communication
        </TabButton>
        <TabButton active={tab === 'timeline'} onClick={() => setTab('timeline')}>
          Timeline
        </TabButton>
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Account & contacts</h2>
            {lead.account && (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">{lead.account.name}</span>
                {lead.account.industry ? ` · ${lead.account.industry}` : ''}
              </p>
            )}
            <ul className="mt-2 space-y-1 text-sm">
              {(lead.contacts || []).map((c) => (
                <li key={c.id}>
                  {c.firstName} {c.lastName}
                  {c.title ? ` — ${c.title}` : ''}
                  {c.email ? ` · ${c.email}` : ''}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Deal stage history</h2>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
              {(primaryDeal?.stageHistory || []).map((h) => (
                <li key={h.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span className="font-medium">
                    {(h.fromStage || '—').replace(/_/g, ' ')} → {h.toStage.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    · {h.changedBy?.name || 'System'} · {new Date(h.createdAt).toLocaleString()}
                  </span>
                  {h.reason ? <div className="text-xs text-slate-500">{h.reason}</div> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Tasks</h2>
            <form onSubmit={onAddTask} className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                name="title"
                placeholder="New task"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              />
              <input
                name="due"
                type="datetime-local"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Add
              </button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {(lead.tasks || []).map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span>{t.title}</span>
                  <span className="text-xs text-slate-500">{t.status}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notes</h2>
            <form onSubmit={onAddNote} className="mt-2 space-y-2">
              <textarea
                name="body"
                rows={3}
                placeholder="Add a note…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Save note
              </button>
            </form>
            <ul className="mt-3 space-y-2 text-sm">
              {(lead.leadNotes || []).map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  {n.body}
                  <div className="text-xs text-slate-500">
                    {n.createdBy?.name} · {new Date(n.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === 'comms' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Email thread</h2>
            <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto text-sm">
              {(lead.emails || []).map((e) => (
                <li key={e.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <div className="text-xs font-semibold uppercase text-slate-500">{e.direction}</div>
                  <div className="font-medium">{e.subject || '(no subject)'}</div>
                  <div className="text-xs text-slate-500">
                    {e.fromAddress} → {e.toAddress}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                    {(e.body || '').slice(0, 2000)}
                  </p>
                  <div className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI & approval</h2>
            <div>
              <label className="text-xs font-medium text-slate-500">Paste email to analyze sentiment</label>
              <textarea
                value={sentimentText}
                onChange={(e) => setSentimentText(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              />
              <button
                type="button"
                onClick={onAnalyze}
                className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
              >
                Analyze & update lead
              </button>
            </div>
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={onDraft}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Generate follow-up draft
              </button>
              {aiBody && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{aiBody}</p>
              )}
            </div>
            <form onSubmit={onSendApproved} className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-500">Send (human-approved)</p>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                placeholder="To"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
              />
              <input
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                placeholder="Subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
              />
              <textarea
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                rows={6}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
              />
              <button
                type="submit"
                className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Send email
              </button>
            </form>
          </section>
        </div>
      )}

      {tab === 'timeline' && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Unified timeline</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {(tlData?.getLeadTimeline || []).map((ev) => (
              <li key={ev.id} className="border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="text-xs uppercase text-slate-500">{ev.kind}</div>
                <div className="font-medium">{ev.title}</div>
                {ev.subtitle && <div className="text-slate-700 dark:text-slate-300">{ev.subtitle}</div>}
                <div className="text-xs text-slate-400">
                  {new Date(ev.at).toLocaleString()} {ev.meta ? `· ${ev.meta}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
