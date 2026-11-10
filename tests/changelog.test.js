import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notesFor, release } from '../scripts/changelog.mjs';

const sample = `# Changelog

Intro.

## Unreleased

### Fixed
- Something new.

## 1.0.8 (9 Nov 2026)

### Fixed
- Long amounts.

## 1.0.6 (9 Nov 2026)

- Header.
`;

test('reads a released version, with or without the v', () => {
  assert.equal(notesFor(sample, '1.0.8'), '### Fixed\n- Long amounts.');
  assert.equal(notesFor(sample, 'v1.0.6'), '- Header.');
  assert.equal(notesFor(sample, '9.9.9'), '');
});

test('files Unreleased under the new version and empties it', () => {
  const out = release(sample, '1.0.9', '10 Nov 2026');
  assert.equal(notesFor(out, 'Unreleased'), '');
  assert.equal(notesFor(out, '1.0.9'), '### Fixed\n- Something new.');
  assert.equal(notesFor(out, '1.0.8'), '### Fixed\n- Long amounts.');
  assert.ok(out.indexOf('## Unreleased') < out.indexOf('## 1.0.9 (10 Nov 2026)') && out.indexOf('## 1.0.9') < out.indexOf('## 1.0.8'));
  assert.ok(out.startsWith('# Changelog\n\nIntro.\n'));
});

test('does nothing when Unreleased is empty, and refuses a duplicate version', () => {
  const empty = release(sample, '1.0.9', 'x');
  assert.equal(release(empty, '1.0.10', 'y'), empty);
  assert.throws(() => release(sample, '1.0.8', 'x'), /already/);
});

test('the real changelog has notes for every published release', () => {
  const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  for (const v of ['1.0.4', '1.0.6', '1.0.8']) assert.ok(notesFor(text, v).length > 20, v);
});
