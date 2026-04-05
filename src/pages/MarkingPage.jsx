import { useEffect, useState } from 'react';
import {
  DEFAULT_EXPORT_PATH,
  fetchJson,
  normalizeZid,
  goToList,
  roundMark,
  buildCommentIndex,
  getCommentOptions,
  getSelectedReduction,
  getSelectedTextsForSection,
  composeOverallComment,
  stripSelectedComments,
  createEditorState,
  buildScorePayload,
  getVisibleMark,
  summariseMarks,
} from '../utils.js';

export default function MarkingPage({ zid }) {
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
            <a href={`https://gitlab.cse.unsw.edu.au/coursework/COMP6080/26T1/students/z${student.entity}/formfiddle/-/blob/master/task1/src/script.js?ref_type=heads`}>
             {`z${student.entity}`} · {student.assignment}
            </a>
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
