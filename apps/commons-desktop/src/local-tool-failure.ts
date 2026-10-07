/** Compare the actual failure, not each execution's random script path. */
export function localToolFailureKey(result: string) {
  let message = result;
  const jsonStart = result.indexOf('{');
  if (result.startsWith('Error: Python execution failed.') && jsonStart >= 0) {
    try {
      const payload = JSON.parse(result.slice(jsonStart)) as { stderr?: string; timedOut?: boolean };
      if (payload.timedOut) message = 'Python execution timed out';
      else if (payload.stderr) message = payload.stderr.trim().split('\n').at(-1) ?? payload.stderr;
    } catch { /* Use the bounded tool error below. */ }
  }
  return message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<execution-id>').slice(0, 1000);
}
