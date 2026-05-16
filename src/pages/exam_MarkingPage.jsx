import { useEffect, useState } from 'react';
import {
  DEFAULT_EXPORT_PATH,
  fetchJson,
  normalizeZid,
  goToList,
  clone,
  serializeMark,
} from '../utils.js';

// Negative-aware rounding — exam has items with min < 0
function roundMark(value) {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function getCheckboxValues(min, max, granularity) {
  if (!granularity) return [roundMark(max)];
  const values = [];
  for (let v = min; v <= max + 1e-9; v = roundMark(v + granularity)) {
    values.push(roundMark(v));
  }
  return values;
}

function getBlobByField(markingBlob) {
  const map = {};
  for (const entry of markingBlob ?? []) {
    map[entry.field] = entry;
  }
  return map;
}

const PENALTY_FIELDS = new Set(['exam1_other_penalty']);

export default function ExamMarkingPage({ zid }) {
  const [student, setStudent] = useState(null);
  const [score, setScore] = useState(null);
  const [schema, setSchema] = useState(null);
  const [checkboxMarks, setCheckboxMarks] = useState({});

  const [outputPath, setOutputPath] = useState(DEFAULT_EXPORT_PATH);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError('');
      setNotice('');
      try {
        const payload = await fetchJson(`/api/students/z${normalizeZid(zid)}/marking`);

        // Schema: marking_schema_blob (parsed array with field_name/breakdown/min/max/granularity)
        const schemaBlob =
          payload.score?.submission?.marking_schema_blob ??
          payload.score?.marking_schema_blob ??
          [];

        // Current marks: markingStructure (normalized from marking_blob)
        const markingBlob = payload.score?.markingStructure ?? [];
        const blobByField = getBlobByField(markingBlob);

        const initCheckboxMarks = {};
        for (const schemaEntry of schemaBlob) {
          const field = schemaEntry.field_name;
          if (PENALTY_FIELDS.has(field)) continue;
          initCheckboxMarks[field] = {};
          for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
            const rawMark = blobByField[field]?.breakdown?.[key]?.mark;
            // Default: max for regular items (min=0), max(=0) for penalty-within-section items
            const defaultMark = schemaBD.max;
            const mark = rawMark !== undefined && rawMark !== '' ? parseFloat(rawMark) : defaultMark;
            initCheckboxMarks[field][key] = roundMark(mark);
          }
        }

        if (!cancelled) {
          setStudent(payload.student);
          setScore(payload.score);
          setSchema(schemaBlob);
          setCheckboxMarks(initCheckboxMarks);
          setOutputPath(payload.defaultExportPath ?? DEFAULT_EXPORT_PATH);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [zid]);

  if (isLoading) return <section className="page"><div className="empty-state">Loading...</div></section>;

  if (error) return (
    <section className="page">
      <div className="notice error">{error}</div>
      <button className="secondary-button" onClick={goToList}>Back to Students</button>
    </section>
  );

  function computeTotal() {
    let total = 0;
    for (const schemaEntry of schema ?? []) {
      const field = schemaEntry.field_name;
      if (PENALTY_FIELDS.has(field)) continue;
      for (const key of Object.keys(schemaEntry.breakdown ?? {})) {
        total += checkboxMarks[field]?.[key] ?? 0;
      }
    }
    return roundMark(total);
  }

  function buildPayload() {
    const nextScore = clone(score);
    nextScore.submissionId = String(student?.recid ?? '').trim();

    const blobByField = getBlobByField(score?.markingStructure ?? []);

    nextScore.markingStructure = (schema ?? []).map((schemaEntry) => {
      const field = schemaEntry.field_name;
      const blobEntry = blobByField[field] ?? {};
      const breakdown = {};

      for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
        if (PENALTY_FIELDS.has(field)) {
          breakdown[key] = { comment: blobEntry.breakdown?.[key]?.comment ?? '' };
        } else {
          const mark = checkboxMarks[field]?.[key] ?? schemaBD.max;
          breakdown[key] = {
            comment: blobEntry.breakdown?.[key]?.comment ?? '',
            mark: serializeMark(mark),
          };
        }
      }

      return { field, overallComment: blobEntry.overallComment ?? '', breakdown };
    });

    return nextScore;
  }

  async function persist() {
    const payload = buildPayload();
    const res = await fetchJson(`/api/students/z${normalizeZid(zid)}/score`, {
      method: 'POST',
      body: JSON.stringify({ score: payload }),
    });
    setScore(res.score);
    return res.score;
  }

  async function handleSave() {
    setIsSaving(true); setNotice(''); setError('');
    try {
      await persist();
      setNotice(`Saved data/scores/z${normalizeZid(zid)}.json`);
    } catch (e) { setError(e.message); }
    finally { setIsSaving(false); }
  }

  async function handleExport() {
    setIsExporting(true); setNotice(''); setError('');
    try {
      await persist();
      const r = await fetchJson('/api/export', {
        method: 'POST',
        body: JSON.stringify({ outputPath: outputPath.trim() || DEFAULT_EXPORT_PATH }),
      });
      setNotice(`Exported ${r.count} records to ${r.outputPath}`);
    } catch (e) { setError(e.message); }
    finally { setIsExporting(false); }
  }

  return (
    <section className="page">
      <div className="toolbar">
        <button className="secondary-button" onClick={goToList}>Back</button>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={handleSave} disabled={isSaving || isExporting}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button className="primary-button" onClick={handleExport} disabled={isSaving || isExporting}>
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="detail-hero">
        <div>
          <p className="eyebrow">Student Marking</p>
          <h1>{student.entityName || `z${normalizeZid(zid)}`}</h1>
          <p className="hero-copy">{`z${student.entity}`} · {student.assignment}</p>
        </div>
        <div className="detail-grid">
          <div className="detail-item"><span>Status</span><strong>{student.marking_status ?? 'Processing'}</strong></div>
          <div className="detail-item"><span>Days Late</span><strong>{student.days_late ?? 0}</strong></div>
          <div className="detail-item"><span>Extension</span><strong>{student.extension_hours ?? 0}h</strong></div>
          <div className="detail-item"><span>Total Marks</span><strong>{computeTotal()}</strong></div>
        </div>
      </div>

      <div className="panel export-panel">
        <label className="input-stack">
          <span>Output path</span>
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            placeholder={DEFAULT_EXPORT_PATH}
          />
        </label>
      </div>

      {(schema ?? []).map((schemaEntry) => {
        const field = schemaEntry.field_name;
        if (PENALTY_FIELDS.has(field)) return null;

        const sectionTotal = roundMark(
          Object.keys(schemaEntry.breakdown ?? {}).reduce(
            (sum, key) => sum + (checkboxMarks[field]?.[key] ?? 0),
            0,
          ),
        );

        return (
          <section className="panel section-panel" key={field}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Section</p>
                <h2>{field}</h2>
              </div>
              <div className="section-header-right">
                <button
                  className="max-button"
                  onClick={() => {
                    setCheckboxMarks((prev) => {
                      const maxed = {};
                      for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
                        maxed[key] = schemaBD.max;
                      }
                      return { ...prev, [field]: maxed };
                    });
                  }}
                >
                  Set Max
                </button>
                <button
                  className="zero-button"
                  onClick={() => {
                    setCheckboxMarks((prev) => {
                      const zeroed = {};
                      for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
                        zeroed[key] = schemaBD.min;
                      }
                      return { ...prev, [field]: zeroed };
                    });
                  }}
                >
                  Set 0
                </button>
                <span className="mark-display">{sectionTotal}</span>
              </div>
            </div>

            <div className="breakdown-grid">
              {Object.entries(schemaEntry.breakdown ?? {}).map(([key, schemaBD]) => {
                const { min, max, granularity, description } = schemaBD;
                const values = getCheckboxValues(min, max, granularity);
                const currentMark = checkboxMarks[field]?.[key] ?? max;

                return (
                  <article className="breakdown-card" key={`${field}-${key}`}>
                    <div className="breakdown-head">
                      <div>
                        <p className="eyebrow">Breakdown</p>
                        <h3>{key}</h3>
                        {description ? <p className="hint-text">{description}</p> : null}
                      </div>
                      <span className="mark-display">
                        {currentMark} / {max}
                      </span>
                    </div>

                    <div className="checkbox-stack">
                      {values.map((val) => (
                        <label className="checkbox-row" key={val}>
                          <input
                            type="checkbox"
                            checked={Math.abs(currentMark - val) < 1e-9}
                            onChange={() => {
                              setCheckboxMarks((prev) => ({
                                ...prev,
                                [field]: { ...(prev[field] ?? {}), [key]: val },
                              }));
                            }}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </section>
  );
}
