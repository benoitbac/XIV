#!/usr/bin/env node
/**
 * XIV — cockpit de suivi.
 *
 * Un serveur localhost sans dépendance : il sert une page unique, pousse un
 * instantané du dépôt toutes les 4 secondes en SSE, et sert trois fichiers
 * JSON déclaratifs (feuille de route, journal, carte système).
 *
 *   npm run dashboard   →   http://localhost:5014
 *
 * Rien n'est déployé : c'est un tableau de bord de poste de travail, pas un
 * site. Il s'audite lui-même en même temps que le reste du dépôt.
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const PORT = Number(process.env.XIV_DASHBOARD_PORT ?? 5014);
const PUSH_INTERVAL_MS = 4000;

/** Répertoires jamais scannés. */
const IGNORED = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite']);

/** Les « briques » du projet : chaque sous-système a sa carte sur la page. */
const SUBSYSTEMS = [
  { name: 'render', path: 'src/render', role: 'Cel-shading, encrage, ciel en bandes' },
  { name: 'player', path: 'src/player', role: 'Contrôleur FPS, armes, view model' },
  { name: 'ai', path: 'src/ai', role: 'Gardes : perception, états, combat' },
  { name: 'world', path: 'src/world', role: 'Collisions, construction des niveaux' },
  { name: 'ui', path: 'src/ui', role: 'HUD, vignettes, onomatopées, menus' },
  { name: 'fx', path: 'src/fx', role: 'Traçantes, impacts, douilles, sang' },
  { name: 'core', path: 'src/core', role: 'Entrées, boucle, audio, sauvegarde, maths' },
  { name: 'story', path: 'src/story', role: 'Tout le texte joueur' },
  { name: 'tests', path: 'tests', role: 'Tests unitaires' },
  { name: 'dashboard', path: 'tools/dashboard', role: 'Ce cockpit' },
];

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

async function git(...args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: REPO, windowsHide: true });
    return stdout;
  } catch {
    // Pas de dépôt, ou git absent : le dashboard doit tourner quand même.
    return '';
  }
}

async function gitSnapshot() {
  const [branch, porcelain, tracking, log, remote] = await Promise.all([
    git('rev-parse', '--abbrev-ref', 'HEAD'),
    git('status', '--porcelain'),
    git('status', '-sb'),
    git('log', '-1', '--pretty=format:%s%x1f%ct%x1f%h'),
    git('remote'),
  ]);

  const dirty = porcelain.split('\n').filter((line) => line.trim().length > 0).length;
  const header = tracking.split('\n')[0] ?? '';
  const ahead = Number(/ahead (\d+)/.exec(header)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(header)?.[1] ?? 0);

  // %x1f dans le format git = separateur d'unite, sur dans un message de commit.
  const [subject, timestamp, hash] = log.split('\u001f');

  return {
    repo: existsSync(join(REPO, '.git')),
    branch: branch.trim() || '—',
    dirty,
    ahead,
    behind,
    remote: remote.trim().length > 0,
    lastCommit: subject ? { subject, at: Number(timestamp) * 1000, hash } : null,
  };
}

// ---------------------------------------------------------------------------
// Scan du système de fichiers
// ---------------------------------------------------------------------------

const COUNTED = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.yml', '.md']);

async function walk(directory, out = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (COUNTED.has(extname(entry.name))) out.push(full);
  }
  return out;
}

async function measure(relativePath) {
  const absolute = join(REPO, relativePath.split('/').join(sep));
  if (!existsSync(absolute)) return { files: 0, lines: 0, touchedAt: 0, missing: true };

  const files = await walk(absolute);
  let lines = 0;
  let touchedAt = 0;

  for (const file of files) {
    const [info, contents] = await Promise.all([stat(file), readFile(file, 'utf8')]);
    touchedAt = Math.max(touchedAt, info.mtimeMs);
    // Les lignes vides ne comptent pas : sinon le chiffre récompense l'aération.
    lines += contents.split('\n').filter((l) => l.trim().length > 0).length;
  }

  return { files: files.length, lines, touchedAt, missing: false };
}

/** actif = édité il y a < 3 min · récent = < 10 min · sinon au repos. */
function activity(touchedAt, now) {
  if (!touchedAt) return 'idle';
  const age = now - touchedAt;
  if (age < 3 * 60_000) return 'active';
  if (age < 10 * 60_000) return 'recent';
  return 'idle';
}

// ---------------------------------------------------------------------------
// Audit des pratiques — les huit conventions, rendues vérifiables par machine
// ---------------------------------------------------------------------------

async function audit() {
  const has = (p) => existsSync(join(REPO, p.split('/').join(sep)));

  let ci = false;
  try {
    const workflows = await readdir(join(REPO, '.github', 'workflows'));
    ci = workflows.some((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  } catch {
    ci = false;
  }

  let tests = 0;
  try {
    const files = await walk(join(REPO, 'tests'));
    for (const file of files) {
      if (!file.endsWith('.test.ts')) continue;
      const contents = await readFile(file, 'utf8');
      tests += (contents.match(/^\s*it\(/gm) ?? []).length;
    }
  } catch {
    tests = 0;
  }

  const remote = (await git('remote')).trim().length > 0;

  return {
    checks: {
      Readme: has('README.md'),
      Gitignore: has('.gitignore'),
      Arch: has('docs/ARCHITECTURE.md'),
      License: has('LICENSE'),
      EditorConfig: has('.editorconfig'),
      Ci: ci,
      Tests: tests > 0,
      Remote: remote,
    },
    testCount: tests,
  };
}

// ---------------------------------------------------------------------------
// Instantané complet
// ---------------------------------------------------------------------------

async function snapshot() {
  const now = Date.now();
  const [vcs, practices] = await Promise.all([gitSnapshot(), audit()]);

  const bricks = [];
  let totalLines = 0;
  let totalFiles = 0;

  for (const subsystem of SUBSYSTEMS) {
    const stats = await measure(subsystem.path);
    totalLines += stats.lines;
    totalFiles += stats.files;
    bricks.push({
      ...subsystem,
      ...stats,
      state: stats.missing ? 'error' : activity(stats.touchedAt, now),
    });
  }

  const passed = Object.values(practices.checks).filter(Boolean).length;
  const total = Object.keys(practices.checks).length;

  return {
    at: now,
    vcs,
    bricks,
    totals: { files: totalFiles, lines: totalLines },
    practices: {
      ...practices,
      passed,
      total,
      score: Math.round((passed / total) * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Serveur
// ---------------------------------------------------------------------------

const clients = new Set();

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function sendFileRaw(res, name, contentType) {
  const path = join(HERE, name);
  if (!existsSync(path)) {
    res.writeHead(204).end();
    return;
  }
  const body = await readFile(path);
  res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  try {
    switch (url.pathname) {
      case '/':
        await sendFileRaw(res, 'dashboard.html', 'text/html; charset=utf-8');
        return;

      case '/events': {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write('retry: 3000\n\n');
        clients.add(res);
        res.write(`data: ${JSON.stringify(await snapshot())}\n\n`);
        req.on('close', () => clients.delete(res));
        return;
      }

      case '/api/snapshot':
        sendJson(res, await snapshot());
        return;

      // Les trois fichiers déclaratifs sont servis tels quels : le serveur ne
      // les désérialise jamais, ce qui évite qu'un schéma se dédouble ici.
      case '/api/roadmap':
        await sendFileRaw(res, 'sprints.json', 'application/json; charset=utf-8');
        return;
      case '/api/changelog':
        await sendFileRaw(res, 'changelog.json', 'application/json; charset=utf-8');
        return;
      case '/api/system':
        await sendFileRaw(res, 'system.json', 'application/json; charset=utf-8');
        return;

      default:
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404');
    }
  } catch (error) {
    sendJson(res, { error: String(error) }, 500);
  }
});

setInterval(async () => {
  if (clients.size === 0) return;
  const payload = `data: ${JSON.stringify(await snapshot())}\n\n`;
  for (const client of clients) client.write(payload);
}, PUSH_INTERVAL_MS).unref?.();

server.listen(PORT, () => {
  const where = relative(process.cwd(), REPO) || '.';
  process.stdout.write(
    `\n  XIV · cockpit\n  dépôt   ${where}\n  écoute  http://localhost:${PORT}\n\n`,
  );
});
