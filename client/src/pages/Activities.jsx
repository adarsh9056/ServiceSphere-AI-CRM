import { useQuery } from '@apollo/client/react'
import { GET_ACTIVITIES } from '../graphql/operations'

export default function Activities() {
  const { data, loading } = useQuery(GET_ACTIVITIES)

  if (loading) {
    return <p className="text-sm text-slate-500">Loading activity…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Activities</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Recent CRM events across leads and deals.
        </p>
      </div>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {(data?.getActivities || []).map((a) => (
          <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">{a.description}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {a.type}
                {a.lead?.name ? ` · ${a.lead.name}` : ''}
                {a.user?.name ? ` · ${a.user.name}` : ''}
              </div>
            </div>
            <time className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</time>
          </li>
        ))}
      </ul>
    </div>
  )
}
