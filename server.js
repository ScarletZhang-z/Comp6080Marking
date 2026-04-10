import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer as createViteServer } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, 'data');
const scoreTemplatePath = path.join(dataDir, 'score.json');
const commentsPath = path.join(dataDir, 'comments.json');
const studentsPath = path.join(dataDir, 'students.json');
const scoresDir = path.join(dataDir, 'scores');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const defaultExportPath = 'data/exported-scores.json';

let vite;

if (!isProduction) {
  vite = await createViteServer({
    root: rootDir,
    server: {
      middlewareMode: true,
    },
    appType: 'custom',
  });
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeZid(value) {
  return String(value ?? '').replace(/^z/i, '');
}

function normalizeRecid(value) {
  return String(value ?? '').trim();
}

function scoreFilePath(zid) {
  return path.join(scoresDir, `z${normalizeZid(zid)}.json`);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendText(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
  });
  response.end(body);
}

function sanitizeLooseJson(input) {
  let output = '';
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      output += char;

      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }

    if (char === ',') {
      let lookAhead = index + 1;

      while (lookAhead < input.length && /\s/.test(input[lookAhead])) {
        lookAhead += 1;
      }

      if (input[lookAhead] === '}' || input[lookAhead] === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(sanitizeLooseJson(raw));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readBody(request) {
  let raw = '';

  for await (const chunk of request) {
    raw += chunk;
  }

  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function normalizeScoreRecord(score, recid) {
  const normalized = deepClone(score);
  const submissionId = recid ?? normalized.submissionId ?? '';
  normalized.submissionId = normalizeRecid(submissionId);
  const markingBlob = normalized.submission?.marking_blob;
  normalized.markingStructure = Array.isArray(normalized.markingStructure) && normalized.markingStructure.length > 0
    ? normalized.markingStructure
    : Array.isArray(markingBlob)
    ? markingBlob
    : [];
  normalized.markingStatus = normalized.markingStatus ?? 'Completed';
  return normalized;
}

async function loadStudents() {
  return readJson(studentsPath);
}

async function loadCommentsTemplate() {
  return readJson(commentsPath);
}

async function loadScoreTemplate() {
  return readJson(scoreTemplatePath);
}

async function getStudentRecord(zid) {
  const students = await loadStudents();
  return students.find((student) => normalizeZid(student.entity) === normalizeZid(zid)) ?? null;
}

async function initializeStudentScore(zid, recid) {
  const filePath = scoreFilePath(zid);

  try {
    const existing = await readJson(filePath);
    return normalizeScoreRecord(existing, recid);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const template = await loadScoreTemplate();
  const initialScore = normalizeScoreRecord(template, recid);
  await writeJson(filePath, initialScore);
  return initialScore;
}

function resolveProjectPath(relativeOrAbsolutePath = defaultExportPath) {
  const resolvedPath = path.resolve(rootDir, relativeOrAbsolutePath);
  const rootPrefix = `${rootDir}${path.sep}`;

  if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootPrefix)) {
    throw new Error('Output path must stay inside the current project.');
  }

  return resolvedPath;
}

async function exportAllScores(outputPath) {
  const students = await loadStudents();
  const aggregatedScores = [];

  for (const student of students) {
    const score = await initializeStudentScore(student.entity, student.recid);
    aggregatedScores.push(normalizeScoreRecord(score, student.recid));
  }

  const resolvedPath = resolveProjectPath(outputPath || defaultExportPath);
  await writeJson(resolvedPath, aggregatedScores);

  return {
    count: aggregatedScores.length,
    outputPath: path.relative(rootDir, resolvedPath),
  };
}

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath);

  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function serveProductionAsset(requestPath, response) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const assetPath = path.join(distDir, normalizedPath);

  try {
    const file = await fs.readFile(assetPath);
    sendText(response, 200, file, mimeTypeFor(assetPath));
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const fallback = await fs.readFile(path.join(distDir, 'index.html'));
  sendText(response, 200, fallback, 'text/html; charset=utf-8');
  return true;
}

async function serveDevelopmentIndex(response) {
  const indexPath = path.join(rootDir, 'index.html');
  let template = await fs.readFile(indexPath, 'utf8');
  template = await vite.transformIndexHtml('/', template);
  sendText(response, 200, template, 'text/html; charset=utf-8');
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/students') {
    const students = await loadStudents();
    sendJson(response, 200, students);
    return true;
  }

  const markingMatch = url.pathname.match(/^\/api\/students\/(z?\d+)\/marking$/);

  if (request.method === 'GET' && markingMatch) {
    const zid = normalizeZid(markingMatch[1]);
    const student = await getStudentRecord(zid);

    if (!student) {
      sendJson(response, 404, {
        error: `Student z${zid} was not found.`,
      });
      return true;
    }

    const [score, comments] = await Promise.all([
      initializeStudentScore(zid, student.recid),
      loadCommentsTemplate(),
    ]);

    sendJson(response, 200, {
      student,
      score,
      comments,
      defaultExportPath,
    });
    return true;
  }

  const scoreMatch = url.pathname.match(/^\/api\/students\/(z?\d+)\/score$/);

  if (request.method === 'POST' && scoreMatch) {
    const zid = normalizeZid(scoreMatch[1]);
    const body = await readBody(request);
    const student = await getStudentRecord(zid);
    const nextScore = normalizeScoreRecord(body.score ?? body, student?.recid);
    await writeJson(scoreFilePath(zid), nextScore);
    sendJson(response, 200, {
      message: `Saved z${zid}.json`,
      score: nextScore,
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/export') {
    const body = await readBody(request);
    const result = await exportAllScores(body.outputPath);
    sendJson(response, 200, {
      message: `Exported ${result.count} score files.`,
      ...result,
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/upload') {
    const body = await readBody(request);
    const cookie = String(body.cookie ?? '').trim();
    const scores = Array.isArray(body.scores) ? body.scores : [];
    const results = [];
    console.log('<<<<<<<<<<<<<< cookie >>>>>>>>>>>>', cookie)
    console.log('<<<<<<<<<<<<<< scores >>>>>>>>>>>>', scores)
    for (const score of scores) {
      try {
        const res = await fetch('https://cgi.cse.unsw.edu.au/~gitrun/api/submission/mark', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'x-gitrun-offering': 'COMP6080_26T1',
            Cookie: cookie,
          },
          body: JSON.stringify(score),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        results.push({ submissionId: score.submissionId, ok: res.ok, status: res.status, data });
      } catch (uploadError) {
        results.push({ submissionId: score.submissionId, ok: false, error: uploadError.message });
      }
    }

    sendJson(response, 200, { results });
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  try {
    const handledApi = await handleApi(request, response, url);

    if (handledApi) {
      return;
    }

    if (isProduction) {
      await serveProductionAsset(url.pathname, response);
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      await serveDevelopmentIndex(response);
      return;
    }

    vite.middlewares(request, response, () => {
      response.statusCode = 404;
      response.end('Not Found');
    });
  } catch (error) {
    if (vite && typeof vite.ssrFixStacktrace === 'function') {
      vite.ssrFixStacktrace(error);
    }

    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Unexpected server error.',
    });
  }
});

server.listen(port, () => {
  console.log(`Marking tool running at http://localhost:${port}`);
});

