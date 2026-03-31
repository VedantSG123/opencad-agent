import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Routes } from 'react-router'

import { Toaster } from './components/ui/sonner'
import { ThemeProvider } from './contexts/theme-context'
import CadTest from './pages/CadTest'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/cad-test' element={<CadTest />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
