import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useMutation } from '@apollo/client/react'
import { LOGIN } from '../graphql/operations'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [login, { loading }] = useMutation(LOGIN)
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const { data } = await login({ variables: { email, password } })
      localStorage.setItem('token', data.login.token)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sign in</h1>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Email
            </label>
            <input
              id="login-email"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Password
            </label>
            <input
              id="login-password"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
          <Link className="text-blue-600 hover:underline dark:text-blue-400" to="/signup">
            Create account
          </Link>
          {' · '}
          <Link className="text-blue-600 hover:underline dark:text-blue-400" to="/forgot">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  )
}
