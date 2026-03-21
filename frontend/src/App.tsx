import { Route, Routes } from 'react-router';

import CadTest from './pages/CadTest';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/cad-test' element={<CadTest />} />
      <Route path='*' element={<NotFound />} />
    </Routes>
  );
}
