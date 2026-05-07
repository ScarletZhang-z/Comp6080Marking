import { useEffect, useState } from 'react';
import { readRoute, goToUpload } from './utils.js';
import StudentsPage from './pages/StudentsPage.jsx';
import MarkingPage from './pages/exam_MarkingPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

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
        <button className="secondary-button" onClick={goToUpload}>
          Upload to gitrun
        </button>
      </header>

      <main className="content-shell">
        {route.page === 'upload' ? (
          <UploadPage />
        ) : route.page === 'detail' ? (
          <MarkingPage zid={route.zid} />
        ) : (
          <StudentsPage />
        )}
      </main>
    </div>
  );
}
