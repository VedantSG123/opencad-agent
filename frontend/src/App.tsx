import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Routes } from 'react-router'

import PerfMonitor from './components/custom/PerfMonitor'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './contexts/theme-context'
import Dashboard, { DashboardView, ProjectsView } from './features/Dashboard'
import CadTest from './pages/CadTest'
import NotFound from './pages/NotFound'
import OpenSCADTest from './pages/OpenSCADTest'
import ProjectPage from './pages/ProjectPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
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
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
