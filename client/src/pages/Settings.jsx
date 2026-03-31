import { useQuery, useMutation } from '@apollo/client/react'
import { AUTOMATION_RULES, AUTOMATION_EXECUTIONS, RUN_INBOUND_SYNC } from '../graphql/operations'

export default function Settings() {
  const { data, loading, error } = useQuery(AUTOMATION_RULES, {
    skip: false,
    errorPolicy: 'all',
  })
  const { data: exData, error: exError } = useQuery(AUTOMATION_EXECUTIONS, {
    variables: { limit: 30 },
    errorPolicy: 'all',
  })
  const [runSync, { loading: syncLoading, data: syncData }] = useMutation(RUN_INBOUND_SYNC)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Theme toggles live in the header. Configure integrations via server environment variables.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Environment (backend)</h2>
        <ul className="mt-3 list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
          <li>
            <code className="text-xs">DATABASE_URL</code> — PostgreSQL
          </li>
          <li>
            <code className="text-xs">JWT_SECRET</code> — auth signing
          </li>
          <li>
            <code className="text-xs">SMTP_*</code> — Nodemailer
          </li>
          <li>
            <code className="text-xs">TWILIO_*</code> — WhatsApp
          </li>
          <li>
            <code className="text-xs">OPENAI_API_KEY</code> — sentiment & drafts
          </li>
          <li>
            <code className="text-xs">IMAP_*</code> — inbound email sync (host, user, pass)
          </li>
          <li>
            <code className="text-xs">PUBLIC_APP_URL</code> — password reset links in emails
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Automation rules</h2>
        {error && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {error.message} — only managers and admins can view rules.
          </p>
        )}
        {loading && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
        <ul className="mt-3 space-y-2">
          {(data?.getAutomationRules || []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
            >
              <span className="font-medium text-slate-800 dark:text-slate-200">{r.name}</span>
              <span className="text-xs text-slate-500">
                {r.trigger} → {r.action}
                {r.config ? ` · ${r.config}` : ''} {r.enabled ? '' : '(off)'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Inbound email sync</h2>
          <button
            type="button"
            disabled={syncLoading}
            onClick={() => runSync()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            {syncLoading ? 'Syncing…' : 'Run IMAP sync now'}
          </button>
        </div>
        {syncData?.runInboundEmailSync && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Imported {syncData.runInboundEmailSync.imported}{' '}
            {syncData.runInboundEmailSync.skipped ? '(skipped — check IMAP env)' : ''}
            {syncData.runInboundEmailSync.error
              ? ` — ${syncData.runInboundEmailSync.error}`
              : ''}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Automation execution log</h2>
        {exError && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{exError.message}</p>
        )}
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
          {(exData?.getAutomationExecutions || []).map((e) => (
            <li key={e.id} className="rounded border border-slate-100 px-2 py-1 dark:border-slate-800">
              <span className="font-medium text-slate-800 dark:text-slate-200">{e.status}</span>{' '}
              {e.triggerKey} · {e.rule?.name || '—'} ·{' '}
              {new Date(e.createdAt).toLocaleString()}
              {e.lastError ? <span className="text-red-600"> — {e.lastError}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
