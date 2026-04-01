import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client/react'
import { ME, LOGOUT } from '../graphql/operations'
import { useTheme } from '../context/ThemeContext'

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Leads' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/activities', label: 'Activities' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  const { data } = useQuery(ME)
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const [logoutMutation] = useMutation(LOGOUT)

  async function logout() {
    try {
      await logoutMutation()
    } catch (_) {
      /* still sign out locally */
    }
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            ServiceSphere
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">CRM</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
          {data?.me?.email}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="text-sm font-semibold md:hidden">ServiceSphere</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {dark ? 'Light' : 'Dark'}
            </button>
            <span className="hidden text-sm text-slate-600 dark:text-slate-400 sm:inline">
              {data?.me?.name}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>

        <nav className="flex border-t border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex-1 rounded-md py-2 text-center text-[11px] font-medium',
                  isActive
                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                    : 'text-slate-600 dark:text-slate-400',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
