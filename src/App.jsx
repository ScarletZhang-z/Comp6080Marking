import { useEffect, useState } from 'react';
import { readRoute } from './utils.js';
import StudentsPage from './pages/StudentsPage.jsx';
import MarkingPage from './pages/MarkingPage.jsx';

export default function App() {
  const [route, setRoute] = useState(readRoute());

  useEffect(() => {
    function handleHashChange() {
      setRoute(readRoute());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local React Tool</p>
          <span className="brand">Student Marking Desk</span>
        </div>
      </header>

      <main className="content-shell">
        {route.page === 'detail' ? <MarkingPage zid={route.zid} /> : <StudentsPage />}
      </main>
    </div>
  );
}
