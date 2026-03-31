import { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@apollo/client/react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  GET_LEADS,
  CREATE_LEAD,
  GENERATE_AI_REPLY,
  SEND_EMAIL,
} from '../graphql/operations'

const STATUSES = [
  '',
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]

function formatStatus(s) {
  return String(s || '').replace(/_/g, ' ')
}

export default function Leads() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const [searchInput, setSearchInput] = useState(q)
  const [status, setStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [composeLead, setComposeLead] = useState(null)
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    source: '',
    notes: '',
    companySize: '',
  })

  const variables = useMemo(
    () => ({ search: q || undefined, status: status || undefined }),
    [q, status],
  )

  const { data, loading, refetch } = useQuery(GET_LEADS, { variables })
  const [createLead, { loading: creating }] = useMutation(CREATE_LEAD)
  const [generateAi] = useMutation(GENERATE_AI_REPLY)
  const [sendEmail, { loading: sending }] = useMutation(SEND_EMAIL)

  function applySearch(e) {
    e.preventDefault()
    const next = new URLSearchParams(params)
    if (searchInput.trim()) next.set('q', searchInput.trim())
    else next.delete('q')
    setParams(next)
  }

  async function onCreateLead(e) {
    e.preventDefault()
    await createLead({
      variables: {
        name: form.name,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        source: form.source || null,
        notes: form.notes || null,
        companySize: form.companySize ? Number(form.companySize) : null,
      },
    })
    setModalOpen(false)
    setForm({
      name: '',
      company: '',
      email: '',
      phone: '',
      source: '',
      notes: '',
      companySize: '',
    })
    refetch()
  }

  async function onGenerateDraft() {
    if (!composeLead) return
    const { data: d } = await generateAi({ variables: { leadId: composeLead.id } })
    const el = document.getElementById('email-body')
    if (el) el.value = d.generateAIReply.body
  }

  async function onSendEmail(e) {
    e.preventDefault()
    if (!composeLead) return
    const to = document.getElementById('email-to').value
    const subject = document.getElementById('email-subject').value
    const body = document.getElementById('email-body').value
    await sendEmail({
      variables: { leadId: composeLead.id, to, subject, body },
    })
    setComposeLead(null)
    refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Leads</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Search, filter, and follow up.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New lead
        </button>
      </div>

      <form
        onSubmit={applySearch}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-end"
      >
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Search
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            placeholder="Name, company, email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Status
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? formatStatus(s) : 'All statuses'}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data?.getLeads || []).map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    <Link className="hover:underline" to={`/leads/${lead.id}`}>
                      {lead.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {lead.company || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {lead.email || '—'}
                  </td>
                  <td className="px-4 py-3">{lead.score}</td>
                  <td className="px-4 py-3">{formatStatus(lead.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-blue-600 text-xs font-semibold hover:underline dark:text-blue-400"
                      onClick={() =>
                        setComposeLead({
                          id: lead.id,
                          name: lead.name,
                          email: lead.email,
                        })
                      }
                    >
                      Follow-up
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New lead</h2>
            <form className="mt-4 space-y-3" onSubmit={onCreateLead}>
              <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
              <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Field label="Source" value={form.source} onChange={(v) => setForm({ ...form, source: v })} />
              <Field
                label="Company size"
                value={form.companySize}
                onChange={(v) => setForm({ ...form, companySize: v })}
              />
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Notes</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {composeLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Email — {composeLead.name}
            </h2>
            <form className="mt-4 space-y-3" onSubmit={onSendEmail}>
              <div>
                <label className="text-xs font-medium text-slate-500">To</label>
                <input
                  id="email-to"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  defaultValue={composeLead.email || ''}
                  required
                  type="email"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Subject</label>
                <input
                  id="email-subject"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  defaultValue="Following up on ServiceSphere CRM"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-500">Body</label>
                  <button
                    type="button"
                    onClick={onGenerateDraft}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                  >
                    Generate with AI
                  </button>
                </div>
                <textarea
                  id="email-body"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  rows={8}
                  placeholder="Write or generate a follow-up…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposeLead(null)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, required }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
