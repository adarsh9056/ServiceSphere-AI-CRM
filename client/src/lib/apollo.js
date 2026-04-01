import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  ApolloLink,
  concat,
  from,
} from '@apollo/client'
import { ErrorLink } from '@apollo/client/link/error'
import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { Observable } from 'rxjs'

// Default: direct API URL so dev works without Vite proxy; cookies still attach to this host when using credentials:'include'.
const httpUri = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql'

const httpLink = new HttpLink({
  uri: httpUri,
  credentials: 'include',
})

async function refreshAccessToken() {
  try {
    const r = await fetch(httpUri, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'mutation { refreshSession { token } }',
      }),
    })
    const j = await r.json()
    const token = j.data?.refreshSession?.token
    if (!token) return false
    localStorage.setItem('token', token)
    return true
  } catch {
    return false
  }
}

const errorLink = new ErrorLink(({ error, operation, forward }) => {
  if (!CombinedGraphQLErrors.is(error)) return
  const unauth = error.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED')
  if (!unauth || operation.operationName === 'RefreshSession') return
  if (!localStorage.getItem('token')) return

  return new Observable((observer) => {
    let subscription
    refreshAccessToken()
      .then((ok) => {
        if (!ok) {
          localStorage.removeItem('token')
          observer.error(error)
          return
        }
        subscription = forward(operation).subscribe({
          next: (v) => observer.next(v),
          error: (e) => observer.error(e),
          complete: () => observer.complete(),
        })
      })
      .catch((e) => observer.error(e))
    return () => subscription?.unsubscribe()
  })
})

const authMiddleware = new ApolloLink((operation, forward) => {
  const token = localStorage.getItem('token')
  operation.setContext(({ headers = {} }) => ({
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  }))
  return forward(operation)
})

export const apolloClient = new ApolloClient({
  link: from([errorLink, concat(authMiddleware, httpLink)]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
