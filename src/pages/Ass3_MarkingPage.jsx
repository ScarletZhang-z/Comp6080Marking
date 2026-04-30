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
  clone,
  serializeMark,
} from '../utils.js';

function NumberInput({ value, min, step, onCommit }) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={min}
      step={step}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        const rounded = roundMark(raw);
        setRaw(String(rounded));
        onCommit(rounded);
      }}
    />
  );
}

const ORIGINAL_LOGIC_FIELDS = new Set(['ass3_git_score']);
const CODE_STYLE_FIELDS = new Set(['ass3_code_style']);
const PENALTY_FIELDS = new Set(['ass3_other_penalty']);

function getCheckboxValues(min, max, granularity) {
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

export default function Ass2MarkingPage({ zid }) {
  const [student, setStudent] = useState(null);
  const [score, setScore] = useState(null);
  const [schema, setSchema] = useState(null);
  const [comments, setComments] = useState(null);

  // original-logic fields (git_score, code_style)
  const [baseMarks, setBaseMarks] = useState({});
  const [selectedComments, setSelectedComments] = useState({});
  const [manualComments, setManualComments] = useState({});

  // checkbox-logic fields (compliance, etc.)
  const [checkboxMarks, setCheckboxMarks] = useState({});
  const [cbManualComments, setCbManualComments] = useState({});

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
        const schemaBlob = payload.score?.submission?.marking_schema_blob ?? [];
        const markingBlob = payload.score?.submission?.marking_blob ?? [];
        const ci = buildCommentIndex(payload.comments);
        const blobByField = getBlobByField(markingBlob);

        const initBaseMarks = {};
        const initSelectedComments = {};
        const initManualComments = {};
        const initCheckboxMarks = {};
        const initCbManualComments = {};

        for (const schemaEntry of schemaBlob) {
          const field = schemaEntry.field_name;
          const blobEntry = blobByField[field] ?? {};

          if (ORIGINAL_LOGIC_FIELDS.has(field)) {
            initBaseMarks[field] = {};
            const overallComment = blobEntry.overallComment ?? '';
            const selectedTexts = [];

            for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
              let reduction = 0;
              for (const option of getCommentOptions(ci, field, key)) {
                const isSelected = overallComment.includes(option.text);
                initSelectedComments[option.key] = isSelected;
                if (isSelected) {
                  reduction += option.reduction;
                  selectedTexts.push(option.text);
                }
              }
              const rawMark = blobEntry.breakdown?.[key]?.mark;
              const mark =
                rawMark !== undefined && rawMark !== '' ? parseFloat(rawMark) : schemaBD.max;
              initBaseMarks[field][key] = roundMark(mark + reduction);
            }

            initManualComments[field] = stripSelectedComments(overallComment, selectedTexts);
          } else if (CODE_STYLE_FIELDS.has(field)) {
            // Comments come from comments.json under "codequality" key
            const overallComment = blobEntry.overallComment ?? '';
            const selectedTexts = [];
            for (const option of getCommentOptions(ci, field, 'codequality')) {
              const isSelected = overallComment.includes(option.text);
              initSelectedComments[option.key] = isSelected;
              if (isSelected) selectedTexts.push(option.text);
            }
            initManualComments[field] = stripSelectedComments(overallComment, selectedTexts);
          } else {
            initCheckboxMarks[field] = {};
            const initDescriptions = [];
            const isPenalty = PENALTY_FIELDS.has(field);
            for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
              const rawMark = blobEntry.breakdown?.[key]?.mark;
              const defaultMark = isPenalty ? schemaBD.min : schemaBD.max;
              const mark =
                rawMark !== undefined && rawMark !== '' ? parseFloat(rawMark) : defaultMark;
              initCheckboxMarks[field][key] = mark;
              const hasPenaltyApplied = isPenalty && mark > schemaBD.min + 1e-9;
              const hasDeduction = !isPenalty && mark < schemaBD.max - 1e-9;
              if (hasPenaltyApplied || hasDeduction) {
                initDescriptions.push(`${key}: ${schemaBD.description}`);
              }
            }
            const initAutoComment = initDescriptions.join('\n');
            const storedComment = blobEntry.overallComment ?? '';
            initCbManualComments[field] = initAutoComment
              ? storedComment.replace(initAutoComment, '').trim()
              : storedComment.trim();
          }
        }

        if (!cancelled) {
          setStudent(payload.student);
          setScore(payload.score);
          setSchema(schemaBlob);
          setComments(payload.comments);
          setBaseMarks(initBaseMarks);
          setSelectedComments(initSelectedComments);
          setManualComments(initManualComments);
          setCheckboxMarks(initCheckboxMarks);
          setCbManualComments(initCbManualComments);
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

  function computeTotal() {
    let total = 0;
    for (const schemaEntry of schema ?? []) {
      const field = schemaEntry.field_name;
      if (ORIGINAL_LOGIC_FIELDS.has(field)) {
        for (const [key] of Object.entries(schemaEntry.breakdown ?? {})) {
          const baseMark = baseMarks[field]?.[key] ?? 0;
          const reduction = getSelectedReduction(commentIndex, selectedComments, field, key);
          total += roundMark(baseMark - reduction);
        }
      } else if (CODE_STYLE_FIELDS.has(field)) {
        const max = schemaEntry.breakdown?.['code style']?.max ?? 10;
        const reduction = getSelectedReduction(commentIndex, selectedComments, field, 'codequality');
        total += roundMark(max - reduction);
      } else if (!PENALTY_FIELDS.has(field)) {
        for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
          total += checkboxMarks[field]?.[key] ?? schemaBD.max;
        }
      }
    }
    return roundMark(total);
  }

  function buildPayload() {
    const nextScore = clone(score);
    nextScore.submissionId = String(student?.recid ?? '').trim();

    const blobByField = getBlobByField(score?.submission?.marking_blob ?? []);

    const newBlob = (schema ?? []).map((schemaEntry) => {
      const field = schemaEntry.field_name;
      const blobEntry = blobByField[field] ?? {};
      const breakdown = {};

      if (ORIGINAL_LOGIC_FIELDS.has(field)) {
        for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
          const baseMark = baseMarks[field]?.[key] ?? schemaBD.max;
          const reduction = getSelectedReduction(commentIndex, selectedComments, field, key);
          breakdown[key] = {
            comment: blobEntry.breakdown?.[key]?.comment ?? '',
            mark: serializeMark(roundMark(baseMark - reduction)),
          };
        }

        const sectionForTexts = { field, breakdown: schemaEntry.breakdown };
        const selectedTexts = getSelectedTextsForSection(
          sectionForTexts,
          commentIndex,
          selectedComments,
        );
        const overallComment = composeOverallComment(manualComments[field], selectedTexts);
        return { field, overallComment, breakdown };
      } else if (CODE_STYLE_FIELDS.has(field)) {
        const max = schemaEntry.breakdown?.['code style']?.max ?? 10;
        const reduction = getSelectedReduction(commentIndex, selectedComments, field, 'codequality');
        breakdown['code style'] = {
          comment: blobEntry.breakdown?.['code style']?.comment ?? '',
          mark: serializeMark(roundMark(max - reduction)),
        };
        const options = getCommentOptions(commentIndex, field, 'codequality');
        const selectedTexts = options
          .filter((opt) => selectedComments[opt.key])
          .map((opt) => opt.text);
        const overallComment = composeOverallComment(manualComments[field], selectedTexts);
        return { field, overallComment, breakdown };
      } else {
        const isPenalty = PENALTY_FIELDS.has(field);
        const descriptions = [];
        for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
          const mark = checkboxMarks[field]?.[key] ?? (isPenalty ? schemaBD.min : schemaBD.max);
          breakdown[key] = {
            comment: blobEntry.breakdown?.[key]?.comment ?? '',
            mark: serializeMark(mark),
          };
          const hasPenaltyApplied = isPenalty && mark > schemaBD.min + 1e-9;
          const hasDeduction = !isPenalty && mark < schemaBD.max - 1e-9;
          if (hasPenaltyApplied || hasDeduction) {
            descriptions.push(`${key}: ${schemaBD.description}`);
          }
        }

        const autoComment = descriptions.join('\n');
        const manual = cbManualComments[field] ?? '';
        const overallComment = [manual, autoComment].filter(Boolean).join('\n\n');
        return { field, overallComment, breakdown };
      }
    });

    nextScore.submission = { ...nextScore.submission, marking_blob: newBlob };
    nextScore.markingStructure = newBlob;
    return nextScore;
  }

  async function persistCurrentScore() {
    const payload = buildPayload();
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
        body: JSON.stringify({ outputPath: outputPath.trim() || DEFAULT_EXPORT_PATH }),
      });
      setNotice(`Exported ${exportResult.count} records to ${exportResult.outputPath}`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setIsExporting(false);
    }
  }

  const totalMarks = computeTotal();

  return (
    <section className="page">
      <div className="toolbar">
        <button className="secondary-button" onClick={goToList}>
          Back
        </button>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            onClick={handleSave}
            disabled={isSaving || isExporting}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="primary-button"
            onClick={handleExport}
            disabled={isSaving || isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="detail-hero">
        <div>
          <p className="eyebrow">Student Marking</p>
          {zid}
          <h1>{student.entityName ?? `z${normalizeZid(zid)}`}</h1>
          <p className="hero-copy">
            <a
              href={`https://gitlab.cse.unsw.edu.au/coursework/COMP6080/26T1/students/z${student.entity}/qanda/-/merge_requests`}
            >
              {`z${student.entity}`} · {student.assignment}
            </a>
          </p>
        </div>
        <div className="detail-grid">
          <div className="detail-item">
            <span>Status</span>
            <strong>{student.marking_status ?? 'Processing'}</strong>
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
            <strong>{totalMarks}</strong>
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

      {(schema ?? []).map((schemaEntry) => {
        const field = schemaEntry.field_name;
        const isOriginal = ORIGINAL_LOGIC_FIELDS.has(field);

        if (isOriginal) {
          // Original logic: number input + comment checkboxes
          const sectionForTexts = { field, breakdown: schemaEntry.breakdown };
          const selectedTexts = getSelectedTextsForSection(
            sectionForTexts,
            commentIndex,
            selectedComments,
          );
          const currentOverallComment = composeOverallComment(
            manualComments[field],
            selectedTexts,
          );

          return (
            <section className="panel section-panel" key={field}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Section</p>
                  <h2>{field}</h2>
                </div>
              </div>

              <label className="input-stack">
                <span>Overall Comment</span>
                <textarea
                  value={currentOverallComment}
                  onChange={(event) => {
                    setManualComments((prev) => ({
                      ...prev,
                      [field]: stripSelectedComments(event.target.value, selectedTexts),
                    }));
                  }}
                  rows={5}
                />
              </label>

              <div className="breakdown-grid">
                {Object.entries(schemaEntry.breakdown ?? {}).map(([key, schemaBD]) => {
                  const options = getCommentOptions(commentIndex, field, key);
                  const baseMark = baseMarks[field]?.[key] ?? schemaBD.max;
                  const reduction = getSelectedReduction(
                    commentIndex,
                    selectedComments,
                    field,
                    key,
                  );
                  const visibleMark = roundMark(baseMark - reduction);

                  return (
                    <article className="breakdown-card" key={`${field}-${key}`}>
                      <div className="breakdown-head">
                        <div>
                          <p className="eyebrow">Breakdown</p>
                          <h3>{key}</h3>
                        </div>
                        <label className="mark-input">
                          <span>Mark</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={visibleMark}
                            onChange={(event) => {
                              const nextVisible = roundMark(event.target.value);
                              setBaseMarks((prev) => ({
                                ...prev,
                                [field]: {
                                  ...(prev[field] ?? {}),
                                  [key]: roundMark(nextVisible + reduction),
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
                                  setSelectedComments((prev) => ({
                                    ...prev,
                                    [option.key]: !prev[option.key],
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
        }

        if (CODE_STYLE_FIELDS.has(field)) {
          const max = schemaEntry.breakdown?.['code style']?.max ?? 10;
          const options = getCommentOptions(commentIndex, field, 'codequality');
          const reduction = getSelectedReduction(commentIndex, selectedComments, field, 'codequality');
          const visibleMark = roundMark(max - reduction);
          const selectedTexts = options.filter((opt) => selectedComments[opt.key]).map((opt) => opt.text);
          const currentOverallComment = composeOverallComment(manualComments[field], selectedTexts);

          return (
            <section className="panel section-panel" key={field}>
              <div className="section-header">
                <div>
                  <p className="eyebrow">Section</p>
                  <h2>{field}</h2>
                </div>
                <span className="mark-display">{visibleMark} / {max}</span>
              </div>

              <label className="input-stack">
                <span>Overall Comment</span>
                <textarea
                  value={currentOverallComment}
                  onChange={(event) => {
                    setManualComments((prev) => ({
                      ...prev,
                      [field]: stripSelectedComments(event.target.value, selectedTexts),
                    }));
                  }}
                  rows={5}
                />
              </label>

              <div className="checkbox-stack">
                {options.map((option) => (
                  <label className="checkbox-row" key={option.key}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedComments[option.key])}
                      onChange={() => {
                        setSelectedComments((prev) => ({
                          ...prev,
                          [option.key]: !prev[option.key],
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
            </section>
          );
        }

        // Checkbox logic: staircase checkboxes based on min/max/granularity
        const isPenaltyField = PENALTY_FIELDS.has(field);
        const descriptions = [];
        for (const [key, schemaBD] of Object.entries(schemaEntry.breakdown ?? {})) {
          const mark = checkboxMarks[field]?.[key] ?? (isPenaltyField ? schemaBD.min : schemaBD.max);
          const hasPenaltyApplied = isPenaltyField && mark > schemaBD.min + 1e-9;
          const hasDeduction = !isPenaltyField && mark < schemaBD.max - 1e-9;
          if (hasPenaltyApplied || hasDeduction) {
            descriptions.push(`${key}: ${schemaBD.description}`);
          }
        }
        const autoComment = descriptions.join('\n');
        const manual = cbManualComments[field] ?? '';
        const currentOverallComment = [manual, autoComment].filter(Boolean).join('\n\n');

        return (
          <section className="panel section-panel" key={field}>
            <div className="section-header">
              <div>
                <p className="eyebrow">Section</p>
                <h2>{field}</h2>
              </div>
            </div>

            <label className="input-stack">
              <span>Overall Comment</span>
              <textarea
                value={currentOverallComment}
                onChange={(event) => {
                  const stripped = event.target.value.replace(autoComment, '').trim();
                  setCbManualComments((prev) => ({ ...prev, [field]: stripped }));
                }}
                rows={5}
              />
            </label>

            <div className="breakdown-grid">
              {Object.entries(schemaEntry.breakdown ?? {}).map(([key, schemaBD]) => {
                const { min, max, granularity } = schemaBD;
                const values = getCheckboxValues(min, max, granularity);
                const currentMark = checkboxMarks[field]?.[key] ?? (isPenaltyField ? min : max);

                return (
                  <article className="breakdown-card" key={`${field}-${key}`}>
                    <div className="breakdown-head">
                      <div>
                        <p className="eyebrow">Breakdown</p>
                        <h3>{key}</h3>
                        <p className="hint-text">{schemaBD.description}</p>
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
