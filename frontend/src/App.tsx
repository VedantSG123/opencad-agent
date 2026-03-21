import { Route, Routes } from 'react-router';

import { ThemeProvider } from './contexts/theme-context';
import CadTest from './pages/CadTest';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/cad-test' element={<CadTest />} />
        <Route path='*' element={<NotFound />} />
      </Routes>
    </ThemeProvider>
  );
}
