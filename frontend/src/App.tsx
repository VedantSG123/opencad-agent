import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { Toaster } from 'sonner'

import PerfMonitor from './components/custom/PerfMonitor'
import { ThemeProvider } from './contexts/theme-context'
import Dashboard, { DashboardView, ProjectsView } from './features/Dashboard'
import { usePlatform } from './hooks/usePlatform'
import CadTest from './pages/CadTest'
import NotFound from './pages/NotFound'
import OpenSCADTest from './pages/OpenSCADTest'
import ProjectPage from './pages/ProjectPage'

const queryClient = new QueryClient()

export default function App() {
  const { isWin } = usePlatform()

  // Windows renders the mica material behind the whole OS window, so the
  // document body must stay transparent for it to show through; every other
  // platform keeps an opaque body. Platform never changes at runtime, so this
  // only needs to run once here rather than in every component that cares.
  useEffect(() => {
    document.body.classList.toggle('bg-transparent', isWin)
  }, [isWin])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {import.meta.env.DEV && <PerfMonitor />}
        <Routes>
          <Route element={<Dashboard />}>
            <Route path='/' element={<DashboardView />} />
            <Route path='/projects' element={<ProjectsView />} />
          </Route>
          <Route path='/project/:id' element={<ProjectPage />} />
          <Route path='/cad-test' element={<CadTest />} />
          <Route path='/openscad-test' element={<OpenSCADTest />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
