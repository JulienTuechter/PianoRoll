#!/usr/bin/env node
/**
 * Branch auswählen und zusammenführen.
 *
 *   npm run merge:main   Branch → main
 *   npm run merge:prod   Branch → main → prod
 *
 * main und prod werden nie gelöscht. Am Ende fragt das Skript, ob der gewählte Branch weg soll.
 */
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';

const REMOTE = 'origin';
const PROTECTED = new Set(['main', 'prod']);
const target = argv[2];
if (target !== 'main' && target !== 'prod') {
  console.error('Aufruf: node scripts/merge-branch.mjs <main|prod>');
  exit(1);
}

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

/** git-Ausgabe lesen */
const read = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
/** git ausführen, Ausgabe direkt anzeigen; false bei Fehler */
const run = (...args) => {
  console.log(c.dim(`$ git ${args.join(' ')}`));
  try {
    execFileSync('git', args, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
};
const lines = (s) => s.split('\n').filter(Boolean);

const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q) => (await rl.question(q)).trim();
const yes = async (q) => /^(j|ja|y|yes)$/i.test(await ask(`${q} ${c.dim('[j/N]')} `));
const fail = (msg) => {
  console.error(c.red(`\n✗ ${msg}`));
  rl.close();
  exit(1);
};

// ── Vorbedingungen ────────────────────────────────────────────────────────────
if (read('status', '--porcelain')) fail('Es gibt nicht committete Änderungen. Erst committen oder stashen.');
const startBranch = read('branch', '--show-current');

console.log(c.dim(`Hole aktuellen Stand von ${REMOTE} …`));
if (!run('fetch', '--prune', REMOTE)) fail(`git fetch ${REMOTE} fehlgeschlagen.`);

// ── Branches auflisten (lokal + nur auf dem Server) ───────────────────────────
const local = lines(read('for-each-ref', '--format=%(refname:short)', 'refs/heads'));
const remote = lines(read('for-each-ref', '--format=%(refname:short)', `refs/remotes/${REMOTE}`))
  .map((r) => r.slice(REMOTE.length + 1))
  .filter((r) => r && r !== 'HEAD' && r !== REMOTE);
const names = [...new Set([...local, ...remote])].filter((b) => !PROTECTED.has(b)).sort();

const info = names.map((name) => {
  const isLocal = local.includes(name);
  const isRemote = remote.includes(name);
  const ref = isLocal ? name : `${REMOTE}/${name}`;
  const [date, subject] = read('log', '-1', '--format=%cr%x09%s', ref).split('\t');
  const ahead = Number(read('rev-list', '--count', `${REMOTE}/main..${ref}`));
  return { name, ref, isLocal, isRemote, date, subject, ahead };
});

const flow = target === 'prod' ? 'Branch → main → prod' : 'Branch → main';
console.log(`\n${c.bold(flow)}\n`);
if (target === 'prod') console.log(`  ${c.bold(' 0')}  ${c.dim('kein Branch, nur main → prod')}`);
info.forEach((b, i) => {
  const where = b.isLocal && b.isRemote ? '' : b.isLocal ? c.yellow(' [nur lokal]') : c.dim(' [nur Server]');
  const current = b.name === startBranch ? c.green(' ← aktuell') : '';
  const ahead = b.ahead > 0 ? c.green(`+${b.ahead} neu`) : c.dim('schon in main');
  console.log(`  ${c.bold(String(i + 1).padStart(2))}  ${b.name}${where}${current}`);
  console.log(`      ${ahead} · ${c.dim(`${b.date} · ${b.subject}`)}`);
});
if (info.length === 0 && target === 'main') fail('Keine Branches außer main/prod gefunden.');

const defIdx = info.findIndex((b) => b.name === startBranch);
const answer = await ask(`\nWelcher Branch?${defIdx >= 0 ? c.dim(` [${defIdx + 1}]`) : ''} `);
const pick = answer === '' && defIdx >= 0 ? defIdx + 1 : Number(answer);
const min = target === 'prod' ? 0 : 1;
if (!Number.isInteger(pick) || pick < min || pick > info.length) fail('Ungültige Auswahl.');
const chosen = pick === 0 ? null : info[pick - 1];

// ── Plan bestätigen ───────────────────────────────────────────────────────────
console.log();
if (chosen) console.log(`  ${chosen.name} → ${c.bold('main')}`);
if (target === 'prod') console.log(`  main → ${c.bold('prod')}`);
console.log(c.dim(`  danach: Push nach ${REMOTE}`));
if (!(await yes('\nLos?'))) fail('Abgebrochen.');

/** Zielzweig aktualisieren, Quelle hineinmergen, pushen */
const mergeInto = (branch, source) => {
  console.log(`\n${c.bold(`── ${source} → ${branch}`)}`);
  if (!run('switch', branch)) fail(`Konnte nicht zu ${branch} wechseln.`);
  if (!run('pull', '--ff-only', REMOTE, branch))
    fail(
      `${branch} lässt sich nicht vorspulen (lokal und Server sind auseinandergelaufen). Bitte von Hand klären.`,
    );
  if (!run('merge', '--no-edit', source))
    fail(
      `Merge-Konflikt in ${branch}. Du bist jetzt auf ${branch}.\n` +
        `  Konflikte lösen, dann: git add … && git commit && git push ${REMOTE} ${branch}\n` +
        `  Oder abbrechen: git merge --abort`,
    );
  if (!run('push', REMOTE, branch)) fail(`Push von ${branch} fehlgeschlagen.`);
  console.log(c.green(`✓ ${branch} aktualisiert`));
};

if (chosen) mergeInto('main', chosen.ref);
if (target === 'prod') mergeInto('prod', 'main');

// ── Branch löschen? ───────────────────────────────────────────────────────────
let backTo = startBranch;
if (chosen && (await yes(`\nBranch ${c.bold(chosen.name)} löschen (lokal und auf ${REMOTE})?`))) {
  if (chosen.isLocal) {
    // -d löscht nur, wenn der Branch vollständig gemergt ist
    if (run('branch', '-d', chosen.name)) console.log(c.green(`✓ lokal gelöscht`));
    else console.log(c.yellow('! Lokal nicht gelöscht (nicht vollständig gemergt?).'));
  }
  if (chosen.isRemote) {
    if (run('push', REMOTE, '--delete', chosen.name)) console.log(c.green(`✓ auf ${REMOTE} gelöscht`));
    else console.log(c.yellow(`! Auf ${REMOTE} nicht gelöscht.`));
  }
  if (backTo === chosen.name) backTo = 'main';
}

// ── Zurück, wo du angefangen hast ─────────────────────────────────────────────
if (backTo && (local.includes(backTo) || backTo === 'main')) run('switch', backTo);
console.log(c.green(`\nFertig. Du bist auf ${read('branch', '--show-current')}.`));
rl.close();
