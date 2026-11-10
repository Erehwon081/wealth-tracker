#!/usr/bin/env node
// Reads and updates CHANGELOG.md for the release workflows.
//   node scripts/changelog.mjs notes <version|Unreleased>   prints that section's notes (empty if none)
//   node scripts/changelog.mjs release <version> <date>       files the Unreleased notes under "## <version> (<date>)"
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEADING = /^## +(.+?)\s*$/;
const versionOf = (title) => title.replace(/\s*\(.*\)\s*$/, '').trim();

// Splits the file into the preamble and its "## " sections, keeping every line.
export function parse(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const head = []; const sections = [];
  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) sections.push({ title: m[1], version: versionOf(m[1]), body: [] });
    else (sections.length ? sections[sections.length - 1].body : head).push(line);
  }
  return { head, sections };
}

const trimBody = (lines) => lines.join('\n').trim();

export function notesFor(text, version) {
  const s = parse(text).sections.find((x) => x.version.toLowerCase() === String(version).replace(/^v/, '').toLowerCase());
  return s ? trimBody(s.body) : '';
}

export function release(text, version, date) {
  const { head, sections } = parse(text);
  const un = sections.find((x) => x.version.toLowerCase() === 'unreleased');
  if (!un) throw new Error('No "## Unreleased" section');
  const notes = trimBody(un.body);
  if (!notes) return text; // nothing to file
  if (sections.some((x) => x.version === version)) throw new Error(`Version ${version} is already in the changelog`);
  un.body = [''];
  sections.splice(sections.indexOf(un) + 1, 0, { title: `${version} (${date})`, version, body: ['', notes, ''] });
  return [...head, ...sections.flatMap((x) => [`## ${x.title}`, ...x.body])].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  const file = process.env.CHANGELOG || 'CHANGELOG.md';
  const text = readFileSync(file, 'utf8');
  if (cmd === 'notes') process.stdout.write(notesFor(text, a ?? 'Unreleased'));
  else if (cmd === 'release') writeFileSync(file, release(text, a, b));
  else { console.error('usage: changelog.mjs notes <version> | release <version> <date>'); process.exit(2); }
}
