import { useEffect, useState } from 'react';

const DEFAULT_EXPORT_PATH = 'data/exported-scores.json';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fetchJson(url, options = {}) {
  const requestOptions = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  };

  return fetch(url, requestOptions).then(async (response) => {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(payload?.error ?? 'Request failed.');
    }

    return payload;
  });
}

function normalizeZid(value) {
  return String(value ?? '').replace(/^z/i, '');
}

function normalizeRecid(value) {
  return String(value ?? '').trim();
}

function readRoute() {
  const hash = window.location.hash.replace(/^#/, '');

  if (!hash || hash === '/') {
    return { page: 'list' };
  }

  const detailMatch = hash.match(/^\/student\/(z?\d+)$/);

  if (detailMatch) {
    return {
      page: 'detail',
      zid: normalizeZid(detailMatch[1]),
    };
  }

  return { page: 'list' };
}

function goToList() {
  window.location.hash = '/';
}

function goToStudent(zid) {
  window.location.hash = `/student/z${normalizeZid(zid)}`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMark(value) {
  return Math.round(Math.max(0, numberValue(value)) * 100) / 100;
}

function serializeMark(value) {
  return roundMark(value).toString();
}

function makeOptionKey(sectionField, breakdownKey, index) {
  return `${sectionField}::${breakdownKey}::${index}`;
}

function buildCommentIndex(commentsDocument) {
  const index = {};

  for (const section of commentsDocument?.markingStructure ?? []) {
    index[section.field] = {};

    for (const [breakdownKey, breakdownValue] of Object.entries(section.breakdown ?? {})) {
      const comments = Array.isArray(breakdownValue?.commentCheck)
        ? breakdownValue.commentCheck.filter(Boolean)
        : [];
      const reduction = numberValue(
        breakdownValue?.markReduce ?? breakdownValue?.mark ?? 0,
      );

      index[section.field][breakdownKey] = comments.map((text, optionIndex) => ({
        key: makeOptionKey(section.field, breakdownKey, optionIndex),
        text,
        reduction,
      }));
    }
  }

  return index;
}

function getCommentOptions(commentIndex, sectionField, breakdownKey) {
  return commentIndex[sectionField]?.[breakdownKey] ?? [];
}

function getSelectedReduction(commentIndex, selectedComments, sectionField, breakdownKey) {
  return getCommentOptions(commentIndex, sectionField, breakdownKey).reduce((total, option) => {
    return selectedComments[option.key] ? total + option.reduction : total;
  }, 0);
}

function cleanupCommentText(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripSelectedComments(text, selectedTexts) {
  let result = String(text ?? '');

  for (const selectedText of selectedTexts) {
    if (!selectedText) {
      continue;
    }

    result = result.replace(selectedText, '');
  }

  return cleanupCommentText(result);
}

function getSelectedTextsForSection(section, commentIndex, selectedComments) {
  const selectedTexts = [];
  const seenTexts = new Set();

  for (const breakdownKey of Object.keys(section.breakdown ?? {})) {
    for (const option of getCommentOptions(commentIndex, section.field, breakdownKey)) {
      if (selectedComments[option.key] && !seenTexts.has(option.text)) {
        selectedTexts.push(option.text);
        seenTexts.add(option.text);
      }
    }
  }

  return selectedTexts;
}

function composeOverallComment(manualText, selectedTexts) {
  const parts = [];
  const cleanedManualText = cleanupCommentText(manualText);

  if (cleanedManualText) {
    parts.push(cleanedManualText);
  }

  for (const selectedText of selectedTexts) {
    const cleanedSelectedText = cleanupCommentText(selectedText);

    if (cleanedSelectedText) {
      parts.push(cleanedSelectedText);
    }
  }

  return parts.join('\n\n');
}

function createEditorState(score, commentIndex) {
  const selectedComments = {};
  const manualComments = {};
  const baseMarks = {};

  for (const section of score?.markingStructure ?? []) {
    baseMarks[section.field] = {};

    const selectedTexts = [];

    for (const [breakdownKey, breakdownValue] of Object.entries(section.breakdown ?? {})) {
      let reduction = 0;

      for (const option of getCommentOptions(commentIndex, section.field, breakdownKey)) {
        const isSelected = String(section.overallComment ?? '').includes(option.text);
        selectedComments[option.key] = isSelected;

        if (isSelected) {
          reduction += option.reduction;
          selectedTexts.push(option.text);
        }
      }

      baseMarks[section.field][breakdownKey] = roundMark(numberValue(breakdownValue?.mark) + reduction);
    }

    manualComments[section.field] = stripSelectedComments(section.overallComment ?? '', selectedTexts);
  }

  return {
    selectedComments,
    manualComments,
    baseMarks,
  };
}

function buildScorePayload(score, commentIndex, manualComments, baseMarks, selectedComments, recid) {
  const nextScore = clone(score);
  nextScore.submissionId = normalizeRecid(recid);

  nextScore.markingStructure = nextScore.markingStructure.map((section) => {
    const selectedTexts = getSelectedTextsForSection(section, commentIndex, selectedComments);
    const nextBreakdown = {};

    for (const [breakdownKey, breakdownValue] of Object.entries(section.breakdown ?? {})) {
      const baseMark = baseMarks[section.field]?.[breakdownKey] ?? numberValue(breakdownValue?.mark);
      const nextMark = roundMark(
        baseMark - getSelectedReduction(commentIndex, selectedComments, section.field, breakdownKey),
      );

      nextBreakdown[breakdownKey] = {
        ...breakdownValue,
        mark: serializeMark(nextMark),
      };
    }

    return {
      ...section,
      overallComment: composeOverallComment(manualComments[section.field], selectedTexts),
      breakdown: nextBreakdown,
    };
  });

  return nextScore;
}

function getVisibleMark(sectionField, breakdownKey, score, baseMarks, commentIndex, selectedComments) {
  const sectionBaseMarks = baseMarks[sectionField] ?? {};
  const fallbackSection = score.markingStructure.find((section) => section.field === sectionField);
  const fallbackValue = numberValue(fallbackSection?.breakdown?.[breakdownKey]?.mark);
  const baseMark = sectionBaseMarks[breakdownKey] ?? fallbackValue;
  const reduction = getSelectedReduction(commentIndex, selectedComments, sectionField, breakdownKey);
  return roundMark(baseMark - reduction);
}

function summariseMarks(score, baseMarks, commentIndex, selectedComments) {
  let totalAwarded = 0;
  let rubricItems = 0;

  for (const section of score?.markingStructure ?? []) {
    for (const breakdownKey of Object.keys(section.breakdown ?? {})) {
      totalAwarded += getVisibleMark(
        section.field,
        breakdownKey,
        score,
        baseMarks,
        commentIndex,
        selectedComments,
      );
      rubricItems += 1;
    }
  }

  return {
    totalAwarded: roundMark(totalAwarded),
    rubricItems,
  };
}

function badgeTone(status) {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized.includes('complete')) {
    return 'is-complete';
  }

  if (normalized.includes('process')) {
    return 'is-processing';
  }

  return 'is-neutral';
}

function StudentsPage() {
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

function MarkingPage({ zid }) {
  const [student, setStudent] = useState(null);
  const [score, setScore] = useState(null);
  const [comments, setComments] = useState(null);
  const [manualComments, setManualComments] = useState({});
  const [baseMarks, setBaseMarks] = useState({});
  const [selectedComments, setSelectedComments] = useState({});
  const [outputPath, setOutputPath] = useState(DEFAULT_EXPORT_PATH);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const commentIndex = buildCommentIndex(comments);

  useEffect(() => {
    let cancelled = false;

    async function loadMarkingRecord() {
      setIsLoading(true);
      setError('');
      setNotice('');

      try {
        const payload = await fetchJson(`/api/students/z${normalizeZid(zid)}/marking`);
        const editorState = createEditorState(payload.score, buildCommentIndex(payload.comments));

        if (!cancelled) {
          setStudent(payload.student);
          setScore(payload.score);
          setComments(payload.comments);
          setManualComments(editorState.manualComments);
          setBaseMarks(editorState.baseMarks);
          setSelectedComments(editorState.selectedComments);
          setOutputPath(payload.defaultExportPath ?? DEFAULT_EXPORT_PATH);
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

    loadMarkingRecord();

    return () => {
      cancelled = true;
    };
  }, [zid]);

  if (isLoading) {
    return (
      <section className="page">
        <div className="empty-state">Loading z{normalizeZid(zid)}...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="notice error">{error}</div>
        <button className="secondary-button" onClick={goToList}>
          Back to Students
        </button>
      </section>
    );
  }

  const liveScore = buildScorePayload(
    score,
    commentIndex,
    manualComments,
    baseMarks,
    selectedComments,
    student?.recid ?? '',
  );
  const summary = summariseMarks(score, baseMarks, commentIndex, selectedComments);

  async function persistCurrentScore() {
    const payload = buildScorePayload(
      score,
      commentIndex,
      manualComments,
      baseMarks,
      selectedComments,
      student?.recid ?? '',
    );

    const response = await fetchJson(`/api/students/z${normalizeZid(zid)}/score`, {
      method: 'POST',
      body: JSON.stringify({ score: payload }),
    });

    setScore(response.score);
    return response.score;
  }

  async function handleSave() {
    setIsSaving(true);
    setNotice('');
    setError('');

    try {
      await persistCurrentScore();
      setNotice(`Saved data/scores/z${normalizeZid(zid)}.json`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport() {
    setIsExporting(true);
    setNotice('');
    setError('');

    try {
      await persistCurrentScore();
      const exportResult = await fetchJson('/api/export', {
        method: 'POST',
        body: JSON.stringify({
          outputPath: outputPath.trim() || DEFAULT_EXPORT_PATH,
        }),
      });
      setNotice(`Exported ${exportResult.count} records to ${exportResult.outputPath}`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="page">
      <div className="toolbar">
        <button className="secondary-button" onClick={goToList}>
          Back
        </button>
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
          <h1>{student.entityName ?? `z${normalizeZid(zid)}`}</h1>
          <p className="hero-copy">
            {`z${student.entity}`} · {student.assignment}
          </p>
        </div>
        <div className="detail-grid">
          <div className="detail-item">
            <span>Status</span>
            <strong>{liveScore.markingStatus}</strong>
          </div>
          <div className="detail-item">
            <span>Days Late</span>
            <strong>{student.days_late ?? 0}</strong>
          </div>
          <div className="detail-item">
            <span>Extension</span>
            <strong>{student.extension_hours ?? 0}h</strong>
          </div>
          <div className="detail-item">
            <span>Total Marks</span>
            <strong>{summary.totalAwarded}</strong>
          </div>
        </div>
      </div>

      <div className="panel export-panel">
        <div>
          <h2>Export target</h2>
          <p>Default output stays separate from the template score file so initialization remains safe.</p>
        </div>
        <label className="input-stack">
          <span>Output path</span>
          <input
            type="text"
            value={outputPath}
            onChange={(event) => setOutputPath(event.target.value)}
            placeholder={DEFAULT_EXPORT_PATH}
          />
        </label>
      </div>

      {score.markingStructure.map((section) => {
        const selectedTexts = getSelectedTextsForSection(section, commentIndex, selectedComments);
        const currentOverallComment = composeOverallComment(
          manualComments[section.field],
          selectedTexts,
        );

        return (
          <section className="panel section-panel" key={section.field}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Section</p>
                <h2>{section.field}</h2>
              </div>
            </div>

            <label className="input-stack">
              <span>Overall Comment</span>
              <textarea
                value={currentOverallComment}
                onChange={(event) => {
                  setManualComments((currentValue) => ({
                    ...currentValue,
                    [section.field]: stripSelectedComments(event.target.value, selectedTexts),
                  }));
                }}
                rows={5}
              />
            </label>

            <div className="breakdown-grid">
              {Object.entries(section.breakdown ?? {}).map(([breakdownKey]) => {
                const options = getCommentOptions(commentIndex, section.field, breakdownKey);
                const visibleMark = getVisibleMark(
                  section.field,
                  breakdownKey,
                  score,
                  baseMarks,
                  commentIndex,
                  selectedComments,
                );

                return (
                  <article className="breakdown-card" key={`${section.field}-${breakdownKey}`}>
                    <div className="breakdown-head">
                      <div>
                        <p className="eyebrow">Breakdown</p>
                        <h3>{breakdownKey}</h3>
                      </div>
                      <label className="mark-input">
                        <span>Mark</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={visibleMark}
                          onChange={(event) => {
                            const nextVisibleMark = roundMark(event.target.value);
                            const currentReduction = getSelectedReduction(
                              commentIndex,
                              selectedComments,
                              section.field,
                              breakdownKey,
                            );

                            setBaseMarks((currentValue) => ({
                              ...currentValue,
                              [section.field]: {
                                ...(currentValue[section.field] ?? {}),
                                [breakdownKey]: roundMark(nextVisibleMark + currentReduction),
                              },
                            }));
                          }}
                        />
                      </label>
                    </div>

                    {options.length ? (
                      <div className="checkbox-stack">
                        {options.map((option) => (
                          <label className="checkbox-row" key={option.key}>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedComments[option.key])}
                              onChange={() => {
                                setSelectedComments((currentValue) => ({
                                  ...currentValue,
                                  [option.key]: !currentValue[option.key],
                                }));
                              }}
                            />
                            <span>
                              {option.text}
                              <em>{option.reduction ? ` (-${option.reduction})` : ''}</em>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="hint-text">No quick comments configured for this item.</div>
                    )}
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
