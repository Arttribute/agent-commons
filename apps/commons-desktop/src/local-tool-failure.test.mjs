import assert from 'node:assert/strict';
import test from 'node:test';
import { localToolFailureKey } from './local-tool-failure.ts';

test('repeated Python errors stay comparable across generated script paths while different causes remain distinct', () => {
  const error = (id, line, cause) => `Error: Python execution failed.\n${JSON.stringify({ exitCode: 1, stderr: `Traceback (most recent call last):\n  File "/outputs/${id}/analysis.py", line ${line}\n${cause}` })}`;
  const first = error('11111111-1111-4111-8111-111111111111', 10, "FileNotFoundError: missing.csv");
  const retry = error('22222222-2222-4222-8222-222222222222', 15, "FileNotFoundError: missing.csv");
  assert.equal(localToolFailureKey(first), localToolFailureKey(retry));
  assert.notEqual(localToolFailureKey(first), localToolFailureKey(error('22222222-2222-4222-8222-222222222222', 15, "NameError: name 'pd' is not defined")));
  assert.notEqual(localToolFailureKey(first), localToolFailureKey(error('22222222-2222-4222-8222-222222222222', 15, "FileNotFoundError: other.csv")));
});
