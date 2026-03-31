import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@apollo/client/react'
import { REQUEST_RESET } from '../graphql/operations'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [requestReset, { loading }] = useMutation(REQUEST_RESET)

  async function onSubmit(e) {
    e.preventDefault()
    await requestReset({ variables: { email } })
    setDone(true)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reset password</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          If the account exists and SMTP is configured, you will receive an email with a reset link.
          Configure <code className="text-xs">SMTP_*</code> and <code className="text-xs">PUBLIC_APP_URL</code>{' '}
          on the API for production.
        </p>
        {done ? (
          <p className="mt-6 text-sm text-green-600 dark:text-green-400">
            If an account matched that email, a reset message was sent (when SMTP is configured). You can
            still open{' '}
            <Link to="/reset" className="underline">
              reset password
            </Link>{' '}
            with the token from your email.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Request reset'}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link className="text-blue-600 hover:underline dark:text-blue-400" to="/login">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}
