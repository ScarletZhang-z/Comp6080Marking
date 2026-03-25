import { useEffect, useState } from 'react';
import { fetchJson, goToStudent, badgeTone } from '../utils.js';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      setIsLoading(true);
      setError('');

      try {
        const nextStudents = await fetchJson('/api/students');

        if (!cancelled) {
          setStudents(nextStudents);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadStudents();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="page">
      <div className="hero-card">
        <div>
          <p className="eyebrow">Student Overview</p>
          <h1>Assignment marking workspace</h1>
          <p className="hero-copy">
            Review student metadata, open supporting links, and jump directly into each marking
            record.
          </p>
        </div>
        <div className="hero-metric">
          <span className="metric-value">{students.length}</span>
          <span className="metric-label">students loaded</span>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Students</h2>
            <p>Data source: `data/students.json`</p>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading student list...</div>
        ) : (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>ID / Entity</th>
                  <th>Assignment</th>
                  <th>Contributions</th>
                  <th>Marking</th>
                  <th>Days Late</th>
                  <th>Extension</th>
                  <th>Marking Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.entity}>
                    <td>
                      <div className="student-cell">
                        <strong>{`z${student.entity}`}</strong>
                        <span>{student.entityName ?? 'Unknown student'}</span>
                      </div>
                    </td>
                    <td>{student.assignment}</td>
                    <td>
                      {student.contributions_url ? (
                        <a
                          className="text-link"
                          href={student.contributions_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {student.contributions_status}
                        </a>
                      ) : (
                        <span>{student.contributions_status ?? '--'}</span>
                      )}
                    </td>
                    <td>
                      {student.marking_mr_url ? (
                        <a
                          className="text-link"
                          href={student.marking_mr_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open MR
                        </a>
                      ) : (
                        <span>--</span>
                      )}
                    </td>
                    <td>{student.days_late ?? 0}</td>
                    <td>{student.extension_hours ?? 0}h</td>
                    <td>
                      <span className={`status-badge ${badgeTone(student.marking_status)}`}>
                        {student.marking_status}
                      </span>
                    </td>
                    <td>
                      <button className="primary-button" onClick={() => goToStudent(student.entity)}>
                        Mark
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
