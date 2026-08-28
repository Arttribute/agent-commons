import type { Request } from 'express';
import { principalFrom } from './brain.controller';

describe('Knowledge controller identity boundary', () => {
  it('treats authenticated app-proxy delegation as the signed-in user', () => {
    const request = {
      principal: {
        principalId: 'commons-app',
        principalType: 'service',
      },
      headers: { 'x-owner-id': 'user-1', 'x-initiator': 'user-1' },
    } as unknown as Request;

    expect(principalFrom(request)).toEqual({
      principalId: 'user-1',
      principalType: 'user',
      workspaceId: undefined,
    });
  });

  it('does not let a user principal spoof another owner with a header', () => {
    const request = {
      principal: { principalId: 'user-1', principalType: 'user' },
      headers: { 'x-owner-id': 'user-2' },
    } as unknown as Request;

    expect(principalFrom(request)).toMatchObject({
      principalId: 'user-1',
      principalType: 'user',
    });
  });

  it('retains a direct agent principal for grant enforcement', () => {
    const request = {
      principal: { principalId: 'agent-1', principalType: 'agent' },
      headers: {},
    } as unknown as Request;

    expect(principalFrom(request)).toMatchObject({
      principalId: 'agent-1',
      principalType: 'agent',
    });
  });
});
