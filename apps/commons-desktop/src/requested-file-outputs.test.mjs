import assert from 'node:assert/strict';
import test from 'node:test';
import { requestedFileOutputs } from './requested-file-outputs.ts';

test('tracks every named output while excluding source references', () => {
  assert.deepEqual(requestedFileOutputs('Read source.csv and save stats.json and plot.png. Use earlier-notes.md for context.'), ['stats.json', 'plot.png']);
  assert.deepEqual(requestedFileOutputs('Draft brand.md, copy.md and personas.md. Read references first.'), ['brand.md', 'copy.md', 'personas.md']);
  assert.deepEqual(requestedFileOutputs('Use copy.md. Produce PNGs named headline.png and offer.png. Create landing.html and tracker.js.'), ['headline.png', 'offer.png', 'landing.html', 'tracker.js']);
});

test('does not count attachments or guidance-only references as generated outputs', () => {
  assert.deepEqual(requestedFileOutputs('Read report.csv and explain how to save report.csv.', ['report.csv']), []);
  assert.deepEqual(requestedFileOutputs('Inspect example.html and explain it.'), []);
});

test('a named source and later validation reads are excluded from a multi-file request', () => {
  assert.deepEqual(requestedFileOutputs('Read the file named source.csv. Save summary.v2.json and plot.png, then read baseline.json for validation.'), ['summary.v2.json', 'plot.png']);
});
