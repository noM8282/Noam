import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import NotFound from '@/pages/not-found'
import { Route, Switch, Router as WouterRouter } from 'wouter'
import { useGetMe } from '@workspace/api-client-react'

import { Shell } from '@/components/layout/Shell'
import { Login } from '@/pages/Login'
import { Overview } from '@/pages/Overview'

import { Scripts } from '@/pages/Scripts'
import { ScriptDetail } from '@/pages/ScriptDetail'
import { Panels } from '@/pages/Panels'
import { Keys } from '@/pages/Keys'
import { Servers } from '@/pages/Servers'
import { Settings } from '@/pages/Settings'

const queryClient = new QueryClient()

function ProtectedRoutes() {
  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false
    }
  })

  if (isLoading) {
    return <div className="min-h-[100dvh] bg-background"></div>
  }

  if (error || !user) {
    return <Login />
  }

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/scripts" component={Scripts} />
        <Route path="/scripts/:id" component={ScriptDetail} />
        <Route path="/panels" component={Panels} />
        <Route path="/keys" component={Keys} />
        <Route path="/servers" component={Servers} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/api/auth/discord">
              {() => {
                // Placeholder to catch this route if standard anchor tag links here
                window.location.href = '/api/auth/discord';
                return null;
              }}
            </Route>
            <Route component={ProtectedRoutes} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
