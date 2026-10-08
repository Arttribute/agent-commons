import { toolRequestTimeoutMs } from './tool-request-timeout';

describe('bounded tool transport', () => {
  it('allows managed setup and bounded commands while rejecting infinite request budgets', () => {
    expect(toolRequestTimeoutMs('runPythonAnalysis', {})).toBe(900_000);
    expect(toolRequestTimeoutMs('runComputerCommand', { timeoutSeconds: 30 })).toBe(270_000);
    expect(toolRequestTimeoutMs('runComputerCommand', { timeoutSeconds: Infinity })).toBe(360_000);
    expect(toolRequestTimeoutMs('runComputerCommand', { timeoutSeconds: 999999 })).toBe(840_000);
    expect(toolRequestTimeoutMs('searchUploadedFile', {})).toBe(180_000);
  });
});
