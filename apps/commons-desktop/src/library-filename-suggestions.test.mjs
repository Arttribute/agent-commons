import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryFilenameSuggestions } from './library-filename-suggestions.ts';

test('a descriptive query prefers the actual guide over incidental directory words', () => {
  const paths = ['B2B/Ads/brand.md', 'Examples/Building a campaign tracker.md', 'Examples/Building a campaign tracker.html', 'B2B/Ads/offer.png'];
  const original = [...paths];
  const result = libraryFilenameSuggestions(paths, 'B2B campaign-tracker guide', path => path);
  assert.equal(result[0], 'Examples/Building a campaign tracker.md');
  assert.equal(result[1], 'Examples/Building a campaign tracker.html');
  assert.deepEqual(paths, original);
});

test('suggestions use bounded relevant filenames, including Unicode, without inventing a match', () => {
  const paths = Array.from({ length: 30 }, (_, index) => `参考/レポート-${index}.md`);
  assert.equal(libraryFilenameSuggestions(paths, 'レポート guide', path => path).length, 8);
  assert.deepEqual(libraryFilenameSuggestions(paths, 'missing-workbook', path => path), []);
  assert.deepEqual(libraryFilenameSuggestions(paths, '.md', path => path), []);
});
