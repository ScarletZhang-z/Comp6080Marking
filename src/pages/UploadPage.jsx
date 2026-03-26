import { useRef, useState } from 'react';
import { fetchJson, goToList, DEFAULT_EXPORT_PATH } from '../utils.js';

const COOKIE_STORAGE_KEY = 'gitrun_upload_cookie';

export default function UploadPage() {
  const fileInputRef = useRef(null);
  const [cookie, setCookie] = useState(() => localStorage.getItem(COOKIE_STORAGE_KEY) ?? '');
  const [outputPath] = useState(DEFAULT_EXPORT_PATH);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Please select an exported-scores.json file.');
      return;
    }
    if (!cookie.trim()) {
      setError('Please paste your cookie.');
      return;
    }

    setIsUploading(true);
    setError('');
    setResults(null);
    localStorage.setItem(COOKIE_STORAGE_KEY, cookie);

    try {
      const text = await file.text();
      const scores = JSON.parse(text);
      if (!Array.isArray(scores)) throw new Error('File must be a JSON array.');

      const response = await fetchJson('/api/upload', {
        method: 'POST',
        body: JSON.stringify({
          cookie: cookie.trim(),
          scores,
          outputPath,
        }),
      });
      setResults(response.results);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsUploading(false);
    }
  }

  const successCount = results?.filter((r) => r.ok).length ?? 0;
  const failCount = results ? results.length - successCount : 0;

  return (
    <section className="page">
      <div className="toolbar">
        <button className="secondary-button" onClick={goToList}>
          Back
        </button>
      </div>

      <div className="hero-card">
        <div>
          <p className="eyebrow">Submit Marks</p>
          <h1>Upload to gitrun</h1>
          <p className="hero-copy">
            Select your <code>exported-scores.json</code>, paste your cookie, then upload. The local
            server proxies each request so there are no CORS issues.
          </p>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="panel">
        <div className="panel-header">
          <h2>Configuration</h2>
        </div>
        <div className="form-stack">
          <label className="input-stack">
            <span>exported-scores.json</span>
            <input ref={fileInputRef} type="file" accept=".json" />
          </label>

          <label className="input-stack">
            <span>Cookie — copy from browser DevTools → Application → Cookies → cgi.cse.unsw.edu.au</span>
            <textarea
              rows={4}
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="Paste full cookie string here..."
              style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          </label>

          <button
            className="primary-button"
            onClick={handleUpload}
            disabled={isUploading}
            style={{ alignSelf: 'flex-start' }}
          >
            {isUploading ? 'Uploading...' : 'Upload all scores'}
          </button>
        </div>
      </div>

      {results ? (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Results</h2>
              <p>{successCount} succeeded · {failCount} failed</p>
            </div>
          </div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Submission ID</th>
                  <th>Status</th>
                  <th>Response</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.submissionId}>
                    <td><strong>{result.submissionId}</strong></td>
                    <td>
                      <span className={`status-badge ${result.ok ? 'is-complete' : 'is-neutral'}`}>
                        {result.ok ? `${result.status} OK` : result.error ?? `${result.status} Error`}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {result.data ? JSON.stringify(result.data) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
