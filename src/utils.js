export const DEFAULT_EXPORT_PATH = 'data/exported-scores.json';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function fetchJson(url, options = {}) {
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

export function normalizeZid(value) {
  return String(value ?? '').replace(/^z/i, '');
}

export function normalizeRecid(value) {
  return String(value ?? '').trim();
}

export function readRoute() {
  const hash = window.location.hash.replace(/^#/, '');

  if (!hash || hash === '/') {
    return { page: 'list' };
  }

  if (hash === '/upload') {
    return { page: 'upload' };
  }

  const detailMatch = hash.match(/^\/student\/(z?\w+)$/);

  if (detailMatch) {
    return {
      page: 'detail',
      zid: normalizeZid(detailMatch[1]),
    };
  }

  return { page: 'list' };
}

export function goToUpload() {
  window.location.hash = '/upload';
}

export function goToList() {
  window.location.hash = '/';
}

export function goToStudent(zid) {
  window.location.hash = `/student/z${normalizeZid(zid)}`;
}

export function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMark(value) {
  return Math.round(Math.max(0, numberValue(value)) * 100) / 100;
}

export function serializeMark(value) {
  return roundMark(value).toString();
}

export function makeOptionKey(sectionField, breakdownKey, index) {
  return `${sectionField}::${breakdownKey}::${index}`;
}

export function badgeTone(status) {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized.includes('complete')) {
    return 'is-complete';
  }

  if (normalized.includes('process')) {
    return 'is-processing';
  }

  return 'is-neutral';
}

export function buildCommentIndex(commentsDocument) {
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

export function getCommentOptions(commentIndex, sectionField, breakdownKey) {
  return commentIndex[sectionField]?.[breakdownKey] ?? [];
}

export function getSelectedReduction(commentIndex, selectedComments, sectionField, breakdownKey) {
  return getCommentOptions(commentIndex, sectionField, breakdownKey).reduce((total, option) => {
    return selectedComments[option.key] ? total + option.reduction : total;
  }, 0);
}

export function cleanupCommentText(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripSelectedComments(text, selectedTexts) {
  let result = String(text ?? '');

  for (const selectedText of selectedTexts) {
    if (!selectedText) {
      continue;
    }

    result = result.replace(selectedText, '');
  }

  return cleanupCommentText(result);
}

export function getSelectedTextsForSection(section, commentIndex, selectedComments) {
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

export function composeOverallComment(manualText, selectedTexts) {
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

export function createEditorState(score, commentIndex) {
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

export function buildScorePayload(score, commentIndex, manualComments, baseMarks, selectedComments, recid) {
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

export function getVisibleMark(sectionField, breakdownKey, score, baseMarks, commentIndex, selectedComments) {
  const sectionBaseMarks = baseMarks[sectionField] ?? {};
  const fallbackSection = score.markingStructure.find((section) => section.field === sectionField);
  const fallbackValue = numberValue(fallbackSection?.breakdown?.[breakdownKey]?.mark);
  const baseMark = sectionBaseMarks[breakdownKey] ?? fallbackValue;
  const reduction = getSelectedReduction(commentIndex, selectedComments, sectionField, breakdownKey);
  return roundMark(baseMark - reduction);
}

export function summariseMarks(score, baseMarks, commentIndex, selectedComments) {
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
