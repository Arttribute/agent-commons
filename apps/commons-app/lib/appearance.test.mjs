import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { appearanceValue, resolvedAppearance, APPEARANCE_SCRIPT } from './appearance.ts';

test('light remains default; system resolves explicitly and follows the computer', () => {
  for (const input of [null, undefined, '', 'corrupt']) assert.equal(appearanceValue(input), 'light');
  assert.equal(resolvedAppearance('light', true), 'light');
  assert.equal(resolvedAppearance('dark', false), 'dark');
  assert.equal(resolvedAppearance('system', true), 'dark');
  assert.equal(resolvedAppearance('system', false), 'light');
});

test('first paint handles unavailable storage and resolves persisted appearance', () => {
  for (const [saved, systemDark, expected] of [[null, true, false], ['dark', false, true], ['system', true, true], ['light', true, false], ['throws', true, false]]) {
    let dark; const style = {};
    vm.runInNewContext(APPEARANCE_SCRIPT, {
      localStorage: { getItem: () => { if (saved === 'throws') throw new Error(); return saved; } },
      matchMedia: () => ({ matches: systemDark }),
      document: { documentElement: { dataset: {}, classList: { toggle: (_, value) => { dark = value; } }, style } },
    });
    assert.equal(dark, expected);
    assert.equal(style.colorScheme, expected ? 'dark' : 'light');
  }
});
